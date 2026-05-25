/**
 * DMC 序号生成工具(纯前端,不持久化)
 *
 * 流程:
 *   Step 1. 上传客户给的 DMC 文件(csv/xlsx,单列纯码)
 *   Step 2. 校验(3 步:文件内重复 / 长度一致 / GS1 格式)— 复用桌面端逻辑
 *   Step 3. 输入起始序号 + 预览 — 复用桌面端 nextSeq
 *   Step 4. 导出 csv 或 xlsx(两列:序号 | DMC码)给标签厂 + 工厂
 *
 * Phase 1 MVP:不持久化,所有数据浏览器内存里。
 * 后续 Phase 2 会加 backend 持久化(批次表 + 分发记录 + 工厂校验)。
 */

import { useState, useMemo, useRef } from 'react'
import {
  Card, Button, Upload, Steps, Input, Empty, Table, Tag, Space, Spin, Alert,
  Typography, Divider, message, InputNumber, Collapse,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  CloudUploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { parseDmcFile, exportSeqDmc, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs, nextSeq } from '@/lib/dmc/sequence'
import {
  type AnalysisResult, type AnalysisStage, type AnalysisStepState, type AnalysisAnomaly,
  STAGE_LABELS, STAGE_ORDER,
} from '@/lib/dmc/types'

type Phase = 'upload' | 'analyzing' | 'failed' | 'configure'

export default function DmcBatchesPage() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [parsed, setParsed] = useState<ParsedDmcFile | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [startSeq, setStartSeq] = useState('ADU000001')
  const [previewCount, setPreviewCount] = useState(10)
  const fileInputResetKey = useRef(0)

  // ─── 上传 + 解析 + 校验 ───
  const handleFile = async (file: File) => {
    try {
      setPhase('analyzing')
      // 解析文件
      const p = await parseDmcFile(file)
      setParsed(p)

      // 校验(同步,几千行内毫秒级,UI 不卡;复用 desktop 3-step)
      const result = analyzeDmcCodes(p.codes.map((code) => ({ code })))
      setAnalysis(result)
      setPhase(result.passed ? 'configure' : 'failed')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '文件解析失败')
      setPhase('upload')
    }
  }

  const handleReset = () => {
    setPhase('upload')
    setParsed(null)
    setAnalysis(null)
    setStartSeq('ADU000001')
    fileInputResetKey.current += 1
  }

  // ─── 配置阶段:序号预览 ───
  const assigned = useMemo(() => {
    if (!analysis?.passed || !analysis.uniqueCodes.length) return []
    return assignSeqs(analysis.uniqueCodes, startSeq)
  }, [analysis, startSeq])

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (assigned.length === 0) return
    const baseName = parsed?.filename
      ? parsed.filename.replace(/\.(csv|xlsx|xls)$/i, '') + '_带序号'
      : 'dmc_带序号'
    exportSeqDmc(assigned, baseName, format)
    message.success(`已导出 ${assigned.length} 条 ${format.toUpperCase()}`)
  }

  // ─── 上传 props ───
  const uploadProps: UploadProps = {
    accept: '.csv,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => {
      handleFile(file)
      return false // 不让 antd 真上传(我们本地处理)
    },
  }

  return (
    <div>
      <Card
        title={
          <span>
            DMC 序号生成工具
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              客户给的纯 DMC 配序号 → 同一份带序号表格分发给标签厂 + 工厂,保证三方对齐
            </Typography.Text>
          </span>
        }
        extra={phase !== 'upload' && (
          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            重新开始
          </Button>
        )}
        styles={{ body: { padding: 24 } }}
      >
        <Steps
          current={phase === 'upload' ? 0 : phase === 'analyzing' || phase === 'failed' ? 1 : 2}
          items={[
            { title: '上传 DMC 文件' },
            { title: '校验' },
            { title: '配置序号 + 导出' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {/* Phase 1: 上传 */}
        {phase === 'upload' && (
          <Upload.Dragger {...uploadProps} key={fileInputResetKey.current}>
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined style={{ color: '#6366f1' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
            <p className="ant-upload-hint">
              支持 CSV / XLSX / XLS。文件应包含一列 DMC 码(列名可以是 "DMC" / "DMC码" / "code" 或纯无表头)。
            </p>
          </Upload.Dragger>
        )}

        {/* Phase 2: 校验中 / 校验失败 */}
        {(phase === 'analyzing' || phase === 'failed') && analysis && parsed && (
          <AnalysisView
            parsed={parsed}
            analysis={analysis}
            onRetry={handleReset}
          />
        )}

        {/* Phase 3: 配置序号 + 预览 + 导出 */}
        {phase === 'configure' && analysis?.passed && parsed && (
          <ConfigureView
            parsed={parsed}
            analysis={analysis}
            assigned={assigned}
            startSeq={startSeq}
            setStartSeq={setStartSeq}
            previewCount={previewCount}
            setPreviewCount={setPreviewCount}
            onExport={handleExport}
          />
        )}
      </Card>
    </div>
  )
}

// ─── 校验结果展示(进度链表 + 异常表)───

function AnalysisView({
  parsed, analysis, onRetry,
}: {
  parsed: ParsedDmcFile
  analysis: AnalysisResult
  onRetry: () => void
}) {
  const failed = !analysis.passed

  return (
    <div>
      {failed ? (
        <Alert
          type="error"
          showIcon
          message={`校验未通过(${STAGE_LABELS[analysis.failedStage!]})`}
          description={`文件 ${parsed.filename} 共 ${parsed.total} 行,在 "${STAGE_LABELS[analysis.failedStage!]}" 阶段发现异常,请修复后重新上传。`}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message="3 步校验全部通过"
          description={`共 ${parsed.total} 条 DMC 码可用于生成序号。`}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 进度链表(每步显示做了什么 + 通过/失败的具体统计)*/}
      <Card size="small" style={{ marginBottom: 16 }} title={`校验进度(共 3 步)`}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {STAGE_ORDER.map((stage) => {
            const s = analysis.steps[stage]
            return <StepRow key={stage} stage={stage} state={s} totalCodes={parsed.total} />
          })}
        </Space>
      </Card>

      {/* 异常表(失败时才有) */}
      {failed && analysis.steps[analysis.failedStage!]?.anomalies && (
        <Card
          size="small"
          title={
            <span>
              异常详情(共 {analysis.steps[analysis.failedStage!].anomalies!.length} 条)
            </span>
          }
        >
          <AnomalyTable
            anomalies={analysis.steps[analysis.failedStage!].anomalies!}
          />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button type="primary" onClick={onRetry}>
              重新上传文件
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

// 每个 step 的说明(校验做什么)+ 通过时的统计描述
const STAGE_DETAIL: Record<AnalysisStage, { desc: string; passedText: (state: AnalysisStepState, total: number) => string }> = {
  file_dedup: {
    desc: '检查同一文件内是否有重复的 DMC 码(客户导出时常见手抖问题)',
    passedText: (_s, total) => `${total} 条码全部唯一,无重复`,
  },
  length_check: {
    desc: '取最常见长度作为基准,标记长度异常的码(被截断 / 多 char 等)',
    passedText: (s, total) => `基准长度 ${s.stats?.baselineLength ?? '?'} 字符,${total} 条全部匹配`,
  },
  format_check: {
    desc: '按 GS1 AI 规则解析每条码,支持 (01)GTIN / (21)Serial / (91)Key / (92)Sig 等段',
    passedText: (_s, total) => `${total} 条均符合 GS1 标准`,
  },
}

function StepRow({
  stage,
  state,
  totalCodes,
}: {
  stage: AnalysisStage
  state: AnalysisStepState
  totalCodes: number
}) {
  let icon, color, text
  if (state.status === 'pending') {
    icon = <span style={{ color: '#d9d9d9', fontSize: 18 }}>○</span>
    color = '#999'
    text = '等待'
  } else if (state.status === 'running') {
    icon = <LoadingOutlined style={{ color: '#1677ff', fontSize: 16 }} spin />
    color = '#1677ff'
    text = '进行中...'
  } else if (state.status === 'passed') {
    icon = <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
    color = '#52c41a'
    text = STAGE_DETAIL[stage].passedText(state, totalCodes)
  } else {
    icon = <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
    color = '#ff4d4f'
    text = `发现 ${state.anomalies?.length ?? 0} 条异常 → 详见下方异常表`
  }

  const detail = STAGE_DETAIL[stage]

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 8,
        background: state.status === 'failed'
          ? '#fff1f0'
          : state.status === 'passed'
            ? '#f6ffed'
            : state.status === 'running'
              ? '#e6f4ff'
              : '#fafafa',
        border: '1px solid ' + (
          state.status === 'failed'
            ? '#ffccc7'
            : state.status === 'passed'
              ? '#b7eb8f'
              : state.status === 'running'
                ? '#91caff'
                : '#f0f0f0'
        ),
      }}
    >
      <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: state.status === 'failed' ? '#cf1322' : '#262626' }}>
            {STAGE_LABELS[stage]}
          </span>
          <span style={{ fontSize: 12, color, fontWeight: state.status === 'passed' || state.status === 'failed' ? 500 : 400 }}>
            {text}
          </span>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block', lineHeight: 1.5 }}>
          {detail.desc}
        </Typography.Text>
      </div>
    </div>
  )
}

function AnomalyTable({ anomalies }: { anomalies: AnalysisAnomaly[] }) {
  return (
    <Table
      dataSource={anomalies}
      rowKey="rowIndex"
      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
      size="small"
      scroll={{ y: 400 }}
      columns={[
        {
          title: '行号',
          dataIndex: 'rowIndex',
          width: 70,
          render: (v: number) => v + 1,  // 0-based → 1-based
        },
        {
          title: '类型',
          dataIndex: 'kind',
          width: 130,
          render: (k: AnalysisAnomaly['kind']) => {
            const map: Record<typeof k, { text: string; color: string }> = {
              file_duplicate: { text: '文件内重复', color: 'orange' },
              length_mismatch: { text: '长度不符', color: 'orange' },
              format_invalid: { text: 'GS1 格式错', color: 'red' },
            }
            const m = map[k]
            return <Tag color={m.color}>{m.text}</Tag>
          },
        },
        {
          title: '原因',
          dataIndex: 'reasonText',
          width: 280,
        },
        {
          title: 'DMC',
          dataIndex: 'code',
          ellipsis: true,
          render: (c: string) => (
            <Typography.Text code copyable={{ text: c }} style={{ fontSize: 11 }}>
              {c.length > 60 ? c.slice(0, 60) + '...' : c}
            </Typography.Text>
          ),
        },
      ]}
    />
  )
}

// ─── 配置阶段:序号输入 + 预览 + 导出 ───

function ConfigureView({
  parsed, analysis, assigned, startSeq, setStartSeq, previewCount, setPreviewCount, onExport,
}: {
  parsed: ParsedDmcFile
  analysis: AnalysisResult
  assigned: Array<{ seq: string; dmc: string }>
  startSeq: string
  setStartSeq: (v: string) => void
  previewCount: number
  setPreviewCount: (v: number) => void
  onExport: (format: 'csv' | 'xlsx') => void
}) {
  const total = assigned.length
  const lastSeq = total > 0 ? assigned[total - 1].seq : ''
  const previewSlice = useMemo(
    () => assigned.slice(0, Math.min(previewCount, total)),
    [assigned, previewCount, total],
  )

  return (
    <>
      <Alert
        type="success"
        showIcon
        message={`文件 ${parsed.filename} 校验通过,共 ${total} 条 DMC 码`}
        style={{ marginBottom: 16 }}
      />

      {/* 校验详情(可折叠,默认展开;admin 能回看每步做了什么) */}
      <Collapse
        size="small"
        defaultActiveKey={['steps']}
        style={{ marginBottom: 16 }}
        items={[{
          key: 'steps',
          label: (
            <span style={{ fontSize: 13 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
              校验详情(3 步全部通过)
            </span>
          ),
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {STAGE_ORDER.map((stage) => (
                <StepRow
                  key={stage}
                  stage={stage}
                  state={analysis.steps[stage]}
                  totalCodes={parsed.total}
                />
              ))}
            </Space>
          ),
        }]}
      />

      <Card size="small" title="序号配置" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>起始序号</div>
            <Input
              value={startSeq}
              onChange={(e) => setStartSeq(e.target.value)}
              placeholder="ADU000001"
              style={{ width: 220 }}
            />
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
              自动识别"前缀 + 末尾数字"两段,递增补零
            </Typography.Text>
          </div>
          <Divider type="vertical" style={{ height: 50 }} />
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>第一条序号</div>
            <Typography.Text code style={{ fontSize: 14 }}>
              {assigned[0]?.seq ?? '—'}
            </Typography.Text>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>最后一条序号</div>
            <Typography.Text code style={{ fontSize: 14 }}>
              {lastSeq || '—'}
            </Typography.Text>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>预览前 N 条</div>
            <InputNumber min={5} max={500} value={previewCount} onChange={(v) => setPreviewCount(v ?? 10)} style={{ width: 100 }} />
          </div>
        </div>
      </Card>

      <Card
        size="small"
        title={`预览(显示前 ${previewSlice.length} 条,共 ${total} 条)`}
        extra={
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => onExport('csv')}>
              导出 CSV
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => onExport('xlsx')}>
              导出 XLSX
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={previewSlice}
          rowKey="seq"
          pagination={false}
          size="small"
          columns={[
            {
              title: '#',
              width: 60,
              render: (_v, _r, idx) => idx + 1,
            },
            {
              title: '序号',
              dataIndex: 'seq',
              width: 220,
              render: (s: string) => <Typography.Text code style={{ fontSize: 13 }}>{s}</Typography.Text>,
            },
            {
              title: 'DMC 码',
              dataIndex: 'dmc',
              ellipsis: true,
              render: (c: string) => (
                <Typography.Text code style={{ fontSize: 11 }}>
                  {c.length > 80 ? c.slice(0, 80) + '...' : c}
                </Typography.Text>
              ),
            },
          ]}
        />
      </Card>
    </>
  )
}
