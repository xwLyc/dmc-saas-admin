/**
 * DMC 识别对比 —— admin 工具
 *
 * 三步:
 *   Step 1. 上传源码 (csv/txt/xlsx, 复用 parseDmcFile)
 *   Step 2. 上传 PDF/图片 —— 支持多文件 + 拖文件夹,串行调后端解码
 *   Step 3. set diff: matched / missing / extra / duplicates + 下载 diff CSV
 *
 * 不持久化(一次性工具)。
 */

import { useState, useMemo, useRef } from 'react'
import {
  Card, Button, Upload, Steps, Table, Tag, Space, Alert, Typography,
  message, Statistic, Row, Col, Progress, Tooltip, Collapse,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  CloudUploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, DownloadOutlined, ReloadOutlined,
  ExclamationCircleOutlined, FileSearchOutlined, ClockCircleOutlined,
  FolderOpenOutlined, PlayCircleOutlined,
} from '@ant-design/icons'
import { parseDmcFile, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { recognizeDmc } from '@/services/dmcRecognize'

type Phase = 'upload-source' | 'pick-scan' | 'recognizing' | 'result'

type FileStatus = 'pending' | 'decoding' | 'done' | 'failed'

interface FileTask {
  id: string
  file: File
  status: FileStatus
  /** 解码中 / 完成时,已解的页数(后端逐页推) */
  pagesDone?: number
  /** 解码中 / 完成时,文件总页数(后端首条进度就报出) */
  pagesTotal?: number
  /** 解码开始 wall-clock,用来算 ETA */
  startedAt?: number
  codes?: string[]
  pages?: number
  durationMs?: number
  error?: string
}

interface CodeOccurrence {
  file: string
  count: number
}

interface DiffResult {
  matched: string[]
  missing: string[]
  /** 识别出但源码里没有 —— 标出来自哪些 PDF */
  extra: Array<{ code: string; occurrences: CodeOccurrence[] }>
  /** 同一个码识别出多次 —— 标出在哪些 PDF 各出现几次 */
  duplicates: Array<{ code: string; count: number; occurrences: CodeOccurrence[] }>
}

const ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff']
const MAX_FILE_BYTES = 25 * 1024 * 1024

export default function DmcRecognizeComparePage() {
  const [phase, setPhase] = useState<Phase>('upload-source')
  const [parsedSource, setParsedSource] = useState<ParsedDmcFile | null>(null)
  const [tasks, setTasks] = useState<FileTask[]>([])
  const fileInputResetKey = useRef(0)

  // ─── Step 1: 解析源码 ───
  const handleSourceFile = async (file: File) => {
    try {
      const p = await parseDmcFile(file)
      setParsedSource(p)
      setPhase('pick-scan')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '源码文件解析失败')
    }
  }

  // ─── Step 2a: 加文件到队列 ───
  // dedupe key:同名 + 同大小 + 同 mtime 视为同一物理文件,反复选不重复入队
  const handleAddFiles = (files: File[]) => {
    const valid: FileTask[] = []
    let rejected = 0
    const seen = new Set<string>()
    for (const file of files) {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
      if (!ALLOWED_EXT.includes(ext)) {
        rejected++
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        message.warning(`${file.name} 超过 25MB,已跳过`)
        rejected++
        continue
      }
      const id = `${file.name}-${file.size}-${file.lastModified}`
      if (seen.has(id)) continue
      seen.add(id)
      valid.push({ id, file, status: 'pending' })
    }
    if (rejected > 0) {
      message.info(`已忽略 ${rejected} 个不支持的文件(只接 PDF / 图片)`)
    }
    if (valid.length === 0) return
    // dedupe 一次再合到 state:同 id 已在队列里就跳过(防多次拖同一份)
    setTasks((prev) => {
      const existing = new Set(prev.map((t) => t.id))
      const fresh = valid.filter((t) => !existing.has(t.id))
      return [...prev, ...fresh]
    })
  }

  const handleRemoveTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const handleClearTasks = () => {
    setTasks([])
  }

  // ─── Step 2b: 启动串行解码 ───
  const handleStartRecognize = async () => {
    if (tasks.length === 0) return
    setPhase('recognizing')

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const startedAt = Date.now()
      // mark decoding
      setTasks((prev) => prev.map((t, idx) => idx === i ? {
        ...t, status: 'decoding', startedAt, pagesDone: 0, pagesTotal: undefined,
      } : t))
      try {
        const result = await recognizeDmc(task.file, {
          onProgress: (p) => {
            // 把页进度合并到任务上,React 18 batch 自动合并相邻 setState
            setTasks((prev) => prev.map((t, idx) => idx === i ? {
              ...t, pagesDone: p.page, pagesTotal: p.total,
            } : t))
          },
        })
        setTasks((prev) => prev.map((t, idx) => idx === i ? {
          ...t,
          status: 'done',
          codes: result.codes,
          pages: result.pages,
          pagesDone: result.pages,
          pagesTotal: result.pages,
          durationMs: result.durationMs,
        } : t))
      } catch (err) {
        setTasks((prev) => prev.map((t, idx) => idx === i ? {
          ...t,
          status: 'failed',
          error: err instanceof Error ? err.message : '识别失败',
        } : t))
      }
    }

    setPhase('result')
  }

  // ─── Step 3: 汇总 codes + 计算 diff ───
  // 按文件分组保留 codes,让 diff 能定位 重复/多余 来自哪个 PDF
  const scannedByFile = useMemo(
    () => tasks
      .filter((t) => t.status === 'done')
      .map((t) => ({ file: t.file.name, codes: t.codes ?? [] })),
    [tasks],
  )

  const allScannedCodes = useMemo(
    () => scannedByFile.flatMap((f) => f.codes),
    [scannedByFile],
  )

  const diff = useMemo<DiffResult | null>(() => {
    if (!parsedSource || phase !== 'result') return null
    return computeDiff(parsedSource.codes, scannedByFile)
  }, [parsedSource, scannedByFile, phase])

  const totalDuration = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
    [tasks],
  )

  const totalPages = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.pages ?? 0), 0),
    [tasks],
  )

  const handleReset = () => {
    setPhase('upload-source')
    setParsedSource(null)
    setTasks([])
    fileInputResetKey.current += 1
  }

  const stepIndex =
    phase === 'upload-source' ? 0 :
    phase === 'pick-scan' || phase === 'recognizing' ? 1 :
    2

  const doneCount = tasks.filter((t) => t.status === 'done').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length

  return (
    <Card
      title={
        <span>
          DMC 识别对比
          <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
            上传源码 + 一或多份 DMC PDF/图片(支持拖文件夹),自动识别并比对一致性
          </Typography.Text>
        </span>
      }
      extra={phase !== 'upload-source' && (
        <Button icon={<ReloadOutlined />} onClick={handleReset}>重新开始</Button>
      )}
      styles={{ body: { padding: 24 } }}
    >
      <Steps
        current={stepIndex}
        items={[
          { title: '上传源码', description: parsedSource ? `${parsedSource.total} 条` : 'csv/txt/xlsx' },
          { title: '上传 DMC 文件', description: tasks.length ? `${tasks.length} 个文件` : 'pdf/图片,可多选' },
          { title: '对比结果', description: diff ? `识别 ${allScannedCodes.length} 条` : '' },
        ]}
        style={{ marginBottom: 32 }}
      />

      {phase === 'upload-source' && (
        <SourceUploadStep onFile={handleSourceFile} resetKey={fileInputResetKey.current} />
      )}

      {phase === 'pick-scan' && parsedSource && (
        <PickScanStep
          parsedSource={parsedSource}
          tasks={tasks}
          onAddFiles={handleAddFiles}
          onRemoveTask={handleRemoveTask}
          onClearTasks={handleClearTasks}
          onStart={handleStartRecognize}
          resetKey={fileInputResetKey.current}
        />
      )}

      {phase === 'recognizing' && (
        <RecognizingView
          tasks={tasks}
          doneCount={doneCount}
          failedCount={failedCount}
        />
      )}

      {phase === 'result' && diff && parsedSource && (
        <ResultView
          parsedSource={parsedSource}
          tasks={tasks}
          allScannedCodes={allScannedCodes}
          totalPages={totalPages}
          totalDuration={totalDuration}
          doneCount={doneCount}
          failedCount={failedCount}
          diff={diff}
        />
      )}
    </Card>
  )
}

// ───────────── Step 1 ─────────────

function SourceUploadStep({
  onFile, resetKey,
}: { onFile: (f: File) => void; resetKey: number }) {
  const props: UploadProps = {
    accept: '.csv,.txt,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => { onFile(file); return false },
  }
  return (
    <div>
      <Alert
        type="info" showIcon
        message="第 1 步:上传源码"
        description="上传客户提供的码表 (csv / txt / xlsx)。多列文件会自动识别 DMC 列,首行表头会自动跳过。"
        style={{ marginBottom: 16 }}
      />
      <Upload.Dragger {...props} key={resetKey}>
        <p className="ant-upload-drag-icon">
          <CloudUploadOutlined style={{ color: '#316eea' }} />
        </p>
        <p className="ant-upload-text">点击或拖拽源码文件到这里</p>
        <p className="ant-upload-hint">支持 .csv / .txt / .xlsx / .xls</p>
      </Upload.Dragger>
    </div>
  )
}

// ───────────── Step 2 ─────────────

function PickScanStep({
  parsedSource, tasks, onAddFiles, onRemoveTask, onClearTasks, onStart, resetKey,
}: {
  parsedSource: ParsedDmcFile
  tasks: FileTask[]
  onAddFiles: (files: File[]) => void
  onRemoveTask: (id: string) => void
  onClearTasks: () => void
  onStart: () => void
  resetKey: number
}) {
  // AntD Upload 的坑:beforeUpload 是"每个文件回调一次",所以选 20 个文件会触发
  // 20 次,且每次 fileList 都是完整 20 个 —— 直接 onAddFiles(fileList) 会被加 20*20=400 条。
  // 解法:只在"第一个文件"那次回调里处理整个 fileList,其余次直接 false 阻止上传。
  const handleBeforeUpload = (file: File, fileList: File[]) => {
    if (file === fileList[0]) {
      onAddFiles(fileList)
    }
    return false
  }
  const multiProps: UploadProps = {
    accept: ALLOWED_EXT.join(','),
    multiple: true,
    showUploadList: false,
    beforeUpload: handleBeforeUpload as unknown as UploadProps['beforeUpload'],
  }
  const dirProps: UploadProps = {
    accept: ALLOWED_EXT.join(','),
    directory: true,
    multiple: true,
    showUploadList: false,
    beforeUpload: handleBeforeUpload as unknown as UploadProps['beforeUpload'],
  }

  const totalBytes = tasks.reduce((sum, t) => sum + t.file.size, 0)
  const estMinutes = estimateMinutes(tasks)

  return (
    <div>
      <Alert
        type="success" showIcon
        message={`第 1 步完成:已解析源码 ${parsedSource.total} 条 (${parsedSource.filename})`}
        style={{ marginBottom: 16 }}
      />
      <Alert
        type="info" showIcon
        message="第 2 步:选择要识别的 DMC PDF / 图片"
        description="可以多次选择追加,也可以直接拖一整个文件夹进来。单文件 ≤25MB,只接 PDF / PNG / JPG 等。"
        style={{ marginBottom: 16 }}
      />

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Upload.Dragger {...multiProps} key={`m-${resetKey}`} style={{ padding: '12px 0' }}>
            <p className="ant-upload-drag-icon" style={{ margin: 0 }}>
              <FileSearchOutlined style={{ color: '#316eea', fontSize: 32 }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 13 }}>选择多个文件</p>
            <p className="ant-upload-hint" style={{ fontSize: 11 }}>按住 Cmd/Ctrl 多选</p>
          </Upload.Dragger>
        </Col>
        <Col span={12}>
          <Upload.Dragger {...dirProps} key={`d-${resetKey}`} style={{ padding: '12px 0' }}>
            <p className="ant-upload-drag-icon" style={{ margin: 0 }}>
              <FolderOpenOutlined style={{ color: '#316eea', fontSize: 32 }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 13 }}>选择整个文件夹</p>
            <p className="ant-upload-hint" style={{ fontSize: 11 }}>非 PDF/图片会自动忽略</p>
          </Upload.Dragger>
        </Col>
      </Row>

      {tasks.length > 0 && (
        <Card
          size="small"
          title={
            <Space>
              <span>待识别 {tasks.length} 个文件</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                · {formatBytes(totalBytes)} · 预计 {estMinutes}
              </Typography.Text>
            </Space>
          }
          extra={
            <Space>
              <Button size="small" onClick={onClearTasks}>清空</Button>
              <Button
                size="small" type="primary" icon={<PlayCircleOutlined />}
                onClick={onStart}
              >
                开始识别 ({tasks.length})
              </Button>
            </Space>
          }
          style={{ marginTop: 12 }}
        >
          <FileTaskTable tasks={tasks} onRemove={onRemoveTask} removable />
        </Card>
      )}
    </div>
  )
}

// ───────────── Recognizing ─────────────

function RecognizingView({
  tasks, doneCount, failedCount,
}: {
  tasks: FileTask[]
  doneCount: number
  failedCount: number
}) {
  const total = tasks.length
  const finished = doneCount + failedCount
  const percent = total === 0 ? 0 : Math.round((finished / total) * 100)
  const current = tasks.find((t) => t.status === 'decoding')

  return (
    <div>
      <Alert
        type="info" showIcon
        message={
          <span>
            正在识别第 {finished + (current ? 1 : 0)} / {total} 个文件
            {current && (
              <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                · {current.file.name}
              </Typography.Text>
            )}
          </span>
        }
        description="串行解码,每个文件可能 20s-2min。期间页面别关。"
        style={{ marginBottom: 16 }}
      />
      <Progress percent={percent} status={failedCount > 0 ? 'exception' : 'active'} />
      <div style={{ marginTop: 16 }}>
        <FileTaskTable tasks={tasks} />
      </div>
    </div>
  )
}

// ───────────── Step 3 ─────────────

function ResultView({
  parsedSource, tasks, allScannedCodes, totalPages, totalDuration,
  doneCount, failedCount, diff,
}: {
  parsedSource: ParsedDmcFile
  tasks: FileTask[]
  allScannedCodes: string[]
  totalPages: number
  totalDuration: number
  doneCount: number
  failedCount: number
  diff: DiffResult
}) {
  const allMatched =
    diff.missing.length === 0 &&
    diff.extra.length === 0 &&
    diff.duplicates.length === 0 &&
    failedCount === 0

  return (
    <div>
      {allMatched ? (
        <Alert
          type="success" showIcon
          message="完全一致 ✓"
          description={`源码 ${parsedSource.total} 条 ↔ 识别 ${allScannedCodes.length} 条,全部匹配。`}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="warning" showIcon
          message="发现差异"
          description={
            <span>
              缺失 {diff.missing.length} · 多余 {diff.extra.length} · 重复 {diff.duplicates.length}
              {failedCount > 0 && ` · 识别失败 ${failedCount} 个文件`}
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="源码总数" value={parsedSource.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={`识别 (${doneCount}/${tasks.length} 文件 · ${totalPages} 页)`}
              value={allScannedCodes.length}
              suffix={
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {formatDuration(totalDuration)}
                </Typography.Text>
              }
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="✓ 匹配"
              value={diff.matched.length}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="✗ 缺失 + 多余 + 重复"
              value={diff.missing.length + diff.extra.length + diff.duplicates.length}
              valueStyle={{
                color: diff.missing.length + diff.extra.length + diff.duplicates.length > 0
                  ? '#ff4d4f' : '#52c41a',
              }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ textAlign: 'right', marginBottom: 16 }}>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => downloadDiffCsv(diff, parsedSource.filename)}
        >
          下载 diff CSV
        </Button>
      </div>

      <Collapse
        size="small"
        style={{ marginBottom: 16 }}
        items={[{
          key: 'per-file',
          label: <span>识别明细 (每文件)</span>,
          children: <FileTaskTable tasks={tasks} />,
        }]}
      />

      <DiffTable
        title="✗ 缺失"
        tone="error"
        desc="源码里有,但 PDF/图片没识别出"
        rows={diff.missing.map((code) => ({ code }))}
      />
      <DiffTable
        title="+ 多余"
        tone="warning"
        desc="PDF/图片识别出,但源码里没有"
        rows={diff.extra.map((e) => ({ code: e.code, occurrences: e.occurrences }))}
        sourceCol
      />
      <DiffTable
        title="× 重复"
        tone="warning"
        desc="同一个码在 PDF/图片里识别出多次"
        rows={diff.duplicates.map((d) => ({
          code: d.code, count: d.count, occurrences: d.occurrences,
        }))}
        countCol
        sourceCol
      />
      <DiffTable
        title="✓ 匹配"
        tone="success"
        desc="源码与识别一致 (默认折叠;前 50 条预览)"
        rows={diff.matched.slice(0, 50).map((code) => ({ code }))}
        collapsed
      />
    </div>
  )
}

// ───────────── 文件任务表 ─────────────

function FileTaskTable({
  tasks, onRemove, removable,
}: {
  tasks: FileTask[]
  onRemove?: (id: string) => void
  removable?: boolean
}) {
  return (
    <Table
      dataSource={tasks}
      rowKey="id"
      size="small"
      pagination={tasks.length > 10 ? { pageSize: 10 } : false}
      columns={[
        {
          title: '#', width: 50,
          render: (_v, _r, idx) => idx + 1,
        },
        {
          title: '文件',
          dataIndex: ['file', 'name'],
          ellipsis: true,
          render: (name: string) => (
            <Tooltip title={name}>
              <Typography.Text style={{ fontSize: 12 }}>{name}</Typography.Text>
            </Tooltip>
          ),
        },
        {
          title: '大小', width: 90,
          render: (_v, r: FileTask) => (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {formatBytes(r.file.size)}
            </Typography.Text>
          ),
        },
        {
          title: '状态', width: 160,
          render: (_v, r: FileTask) => <StatusTag task={r} />,
        },
        {
          title: '进度 / 结果', width: 240,
          render: (_v, r: FileTask) => <ProgressOrResultCell task={r} />,
        },
        ...(removable ? [{
          title: '', width: 60,
          render: (_v: unknown, r: FileTask) => (
            <Button size="small" type="link" danger onClick={() => onRemove?.(r.id)}>
              移除
            </Button>
          ),
        }] : []),
      ]}
    />
  )
}

function StatusTag({ task }: { task: FileTask }) {
  if (task.status === 'pending') {
    return <Tag icon={<ClockCircleOutlined />}>等待</Tag>
  }
  if (task.status === 'decoding') {
    // 解码中:显示当前页 / 总页数(后端 progress 推过来)。pagesTotal 未知前先显 "识别中"。
    const label = task.pagesTotal != null
      ? `识别中 ${task.pagesDone ?? 0}/${task.pagesTotal}`
      : '识别中…'
    return <Tag color="processing" icon={<LoadingOutlined spin />}>{label}</Tag>
  }
  if (task.status === 'done') {
    return <Tag color="success" icon={<CheckCircleOutlined />}>完成</Tag>
  }
  return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>
}

/**
 * 第 5 列:
 *   - 解码中:细 Progress 条 + 百分比 + ETA (按已用时间和已完成页数推)
 *   - 完成:页数 · 码数 · 耗时
 *   - 失败:错误信息 (truncate + tooltip)
 *   - 等待:—
 */
function ProgressOrResultCell({ task }: { task: FileTask }) {
  if (task.status === 'done') {
    return (
      <Typography.Text style={{ fontSize: 12 }}>
        {task.pages} 页 · {task.codes?.length ?? 0} 码 · {formatDuration(task.durationMs ?? 0)}
      </Typography.Text>
    )
  }
  if (task.status === 'failed') {
    return (
      <Tooltip title={task.error}>
        <Typography.Text type="danger" style={{ fontSize: 11 }} ellipsis>
          {task.error}
        </Typography.Text>
      </Tooltip>
    )
  }
  if (task.status === 'decoding') {
    const done = task.pagesDone ?? 0
    const total = task.pagesTotal
    const percent = total && total > 0 ? Math.round((done / total) * 100) : 0
    const eta = computeEta(task)
    return (
      <div style={{ minWidth: 220 }}>
        <Progress
          percent={percent}
          size="small"
          showInfo={false}
          status="active"
          style={{ marginBottom: 2 }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {percent}% {eta && `· 剩 ${eta}`}
        </Typography.Text>
      </div>
    )
  }
  return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>
}

/** 用已用时间 + 已完成页数推剩余时间。done==0 / total 未知 → null */
function computeEta(task: FileTask): string | null {
  if (!task.startedAt || !task.pagesDone || !task.pagesTotal) return null
  if (task.pagesDone >= task.pagesTotal) return null
  const elapsed = Date.now() - task.startedAt
  const remaining = (elapsed / task.pagesDone) * (task.pagesTotal - task.pagesDone)
  return formatDuration(remaining)
}

// ───────────── Diff 子表(沿用原版) ─────────────

function DiffTable({
  title, tone, desc, rows, countCol, sourceCol, collapsed,
}: {
  title: string
  tone: 'success' | 'warning' | 'error'
  desc: string
  rows: Array<{ code: string; count?: number; occurrences?: CodeOccurrence[] }>
  countCol?: boolean
  /** 加"来源文件"列(extra / duplicates 用) */
  sourceCol?: boolean
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(!collapsed)
  const tagColor = tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'error'
  const icon = tone === 'success' ? <CheckCircleOutlined /> :
               tone === 'error' ? <CloseCircleOutlined /> :
               <ExclamationCircleOutlined />

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <Tag color={tagColor} icon={icon}>{title}</Tag>
          <Typography.Text strong>{rows.length}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{desc}</Typography.Text>
        </Space>
      }
      extra={
        rows.length > 0 && (
          <Button size="small" type="link" onClick={() => setOpen(!open)}>
            {open ? '折叠' : '展开'}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>—</Typography.Text>
      ) : open ? (
        <Table
          dataSource={rows}
          rowKey="code"
          size="small"
          pagination={rows.length > 20 ? { pageSize: 20 } : false}
          columns={[
            { title: '#', width: 60, render: (_v, _r, i) => i + 1 },
            {
              title: 'DMC 码', dataIndex: 'code', ellipsis: true,
              render: (c: string) => (
                <Typography.Text code copyable={{ text: c }} style={{ fontSize: 11 }}>
                  {c.length > 80 ? c.slice(0, 80) + '...' : c}
                </Typography.Text>
              ),
            },
            ...(countCol ? [{ title: '出现次数', dataIndex: 'count', width: 100 }] : []),
            ...(sourceCol ? [{
              title: '来源 PDF', width: 320,
              render: (_v: unknown, r: { occurrences?: CodeOccurrence[] }) => (
                <SourceFilesCell occurrences={r.occurrences ?? []} />
              ),
            }] : []),
          ]}
        />
      ) : null}
    </Card>
  )
}

/** 渲染码的来源 PDF 列表:多个文件分行,后跟次数。鼠标 hover tooltip 显示完整文件名 */
function SourceFilesCell({ occurrences }: { occurrences: CodeOccurrence[] }) {
  if (occurrences.length === 0) {
    return <Typography.Text type="secondary" style={{ fontSize: 11 }}>—</Typography.Text>
  }
  return (
    <Space direction="vertical" size={2} style={{ width: '100%' }}>
      {occurrences.map((o) => (
        <Tooltip key={o.file} title={o.file}>
          <Typography.Text style={{ fontSize: 11 }} ellipsis={{ tooltip: false }}>
            {o.file}
            {o.count > 1 && (
              <Typography.Text type="warning" style={{ fontSize: 11, marginLeft: 6, fontWeight: 600 }}>
                × {o.count}
              </Typography.Text>
            )}
          </Typography.Text>
        </Tooltip>
      ))}
    </Space>
  )
}

// ───────────── 工具 ─────────────

/**
 * 标准化:剥掉 GS1 段分隔符 0x1d (Group Separator) 再比对。
 *   - libdmtx 解码 GS1 DMC 会在 AI 段之间塞 0x1d
 *   - 客户提供的源码 CSV 通常是 plain ASCII,不含 0x1d
 *   - 同一物理码两种表示等价,直接 set diff 会 100% 不匹配
 *   实测:剥 0x1d 后 1:1 对应。
 *
 * 同时 trim 首尾空白(CSV 行末 \r、Excel BOM 等已在 parseSourceFile 处理过,这里
 * 是 PDF 端兜底)。
 */
function normalizeCode(code: string): string {
  return code.replace(/\x1d/g, '').trim()
}

function computeDiff(
  source: string[],
  scannedByFile: Array<{ file: string; codes: string[] }>,
): DiffResult {
  // 源码归一化 → 原码 (展示用原码)
  const sourceMap = new Map<string, string>()
  for (const c of source) sourceMap.set(normalizeCode(c), c)

  // 扫描端:归一化 key → { 总次数, sample 原码, perFile 计数 Map }
  type ScanInfo = { count: number; sample: string; perFile: Map<string, number> }
  const scanned = new Map<string, ScanInfo>()
  for (const { file, codes } of scannedByFile) {
    for (const raw of codes) {
      const key = normalizeCode(raw)
      let info = scanned.get(key)
      if (!info) {
        info = { count: 0, sample: raw, perFile: new Map() }
        scanned.set(key, info)
      }
      info.count++
      info.perFile.set(file, (info.perFile.get(file) ?? 0) + 1)
    }
  }

  const matched: string[] = []
  const missing: string[] = []
  for (const [key, orig] of sourceMap) {
    if (scanned.has(key)) matched.push(orig)
    else missing.push(orig)
  }

  const extra: DiffResult['extra'] = []
  for (const [key, info] of scanned) {
    if (!sourceMap.has(key)) {
      extra.push({
        code: info.sample,
        occurrences: occurrencesFromMap(info.perFile),
      })
    }
  }

  const duplicates: DiffResult['duplicates'] = []
  for (const [, info] of scanned) {
    if (info.count > 1) {
      duplicates.push({
        code: info.sample,
        count: info.count,
        occurrences: occurrencesFromMap(info.perFile),
      })
    }
  }
  duplicates.sort((a, b) => b.count - a.count)

  return { matched, missing, extra, duplicates }
}

function occurrencesFromMap(m: Map<string, number>): CodeOccurrence[] {
  return [...m.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
}

function downloadDiffCsv(diff: DiffResult, sourceName: string): void {
  // 来源 PDF 用 ` | ` 在单格内拼,Excel 打开能清晰看到。
  // 同一个码出现在多个文件,每个 PDF 一行(避免误导)。
  const lines: string[] = ['状态,DMC码,识别次数,来源 PDF']
  for (const c of diff.matched) lines.push(`matched,${csvField(c)},1,`)
  for (const c of diff.missing) lines.push(`missing,${csvField(c)},0,`)
  for (const e of diff.extra) {
    for (const o of e.occurrences) {
      lines.push(`extra,${csvField(e.code)},${o.count},${csvField(o.file)}`)
    }
  }
  for (const d of diff.duplicates) {
    for (const o of d.occurrences) {
      lines.push(`duplicate,${csvField(d.code)},${o.count},${csvField(o.file)}`)
    }
  }

  const baseName = sourceName.replace(/\.(csv|txt|xlsx|xls)$/i, '')
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}_DMC识别对比.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvField(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s}s`
}

/**
 * 估算总耗时:1MB PDF ~ 13s,图片 ~1s。粗估给个量级,UI 提示用。
 *   - 实测 1.4MB→1000页→19s,7.3MB→5000页→91s,大致 1MB→13s
 */
function estimateMinutes(tasks: FileTask[]): string {
  let est = 0
  for (const t of tasks) {
    const ext = t.file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
    if (ext === '.pdf') {
      est += (t.file.size / 1024 / 1024) * 13
    } else {
      est += 1
    }
  }
  if (est < 60) return `${Math.ceil(est)}s`
  return `${Math.ceil(est / 60)} min`
}
