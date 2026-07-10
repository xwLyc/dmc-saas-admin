/**
 * DMC 码表工具 —— 共享视图组件。
 *
 * 从 DmcBatches.tsx 抽出,被两处复用:
 *   - 后管内页 DmcBatches(登录态,可选工厂 + 存后端 + 后端 round-trip 校验)
 *   - 免登录独立页 DmcTool(纯前端:上传 → 配序号 → 导出,给公司内部人员用)
 *
 * 这里全是纯前端逻辑(parse/validate/sequence/export/print-preview),
 * 唯一涉后端的是 ConfigureView 里的「验证 DMC 有效性」按钮(verifyDmc → /admin/dmc/verify,
 * 需 JWT),用 showBackendVerify 开关控制:独立页传 false 隐藏它。
 */

import { useState, useMemo } from 'react'
import {
  Card, Button, Input, Table, Tag, Space, Alert,
  Typography, Divider, InputNumber, Collapse, Switch, Tooltip, Modal, Progress,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  DownloadOutlined, SaveOutlined, SafetyCertificateOutlined, PrinterOutlined,
} from '@ant-design/icons'
import type { ParsedDmcFile } from '@/lib/dmc/parseFile'
import { verifyDmc, type VerifyMismatch } from '@/services/dmcVerify'
import DmcPrintPreview from '@/components/DmcPrintPreview'
import {
  type AnalysisResult, type AnalysisStage, type AnalysisStepState, type AnalysisAnomaly,
  STAGE_LABELS, STAGE_ORDER,
} from '@/lib/dmc/types'
import type { AdminTenantRow } from '@dmc/contracts'

// ─── 校验结果展示 ───

export function AnalysisView({
  parsed, analysis, onRetry,
}: {
  parsed: ParsedDmcFile
  analysis: AnalysisResult
  onRetry: () => void
}) {
  const failed = !analysis.passed
  const failedBaseline =
    failed && analysis.failedStage === 'length_check'
      ? analysis.steps.length_check.stats?.baselineLength
      : undefined

  return (
    <div>
      {failed ? (
        <Alert
          type="error" showIcon
          message={
            failedBaseline != null
              ? `校验未通过（${STAGE_LABELS[analysis.failedStage!]}，基准长度 ${failedBaseline} 字符）`
              : `校验未通过（${STAGE_LABELS[analysis.failedStage!]}）`
          }
          description={`文件 ${parsed.filename} 共 ${parsed.total} 行，在"${STAGE_LABELS[analysis.failedStage!]}"阶段发现异常，请修复后重新上传。`}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="success" showIcon
          message="3 步校验全部通过"
          description={`共 ${parsed.total} 条 DMC 码可用于生成序号。`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }} title="校验进度（共 3 步）">
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          {STAGE_ORDER.map((stage) => (
            <StepRow key={stage} stage={stage} state={analysis.steps[stage]} totalCodes={parsed.total} />
          ))}
        </Space>
      </Card>

      {failed && analysis.steps[analysis.failedStage!]?.anomalies && (
        <Card size="small" title={`异常详情（共 ${analysis.steps[analysis.failedStage!].anomalies!.length} 条）`}>
          <AnomalyTable anomalies={analysis.steps[analysis.failedStage!].anomalies!} />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button type="primary" onClick={onRetry}>重新上传文件</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

const STAGE_DETAIL: Record<AnalysisStage, { desc: string; passedText: (state: AnalysisStepState, total: number) => string }> = {
  file_dedup: {
    desc: '检查同一文件内是否有重复的 DMC 码',
    passedText: (_s, total) => `${total} 条码全部唯一，无重复`,
  },
  length_check: {
    desc: '取最常见长度作为基准，标记长度异常的码',
    passedText: (s, total) => `基准长度 ${s.stats?.baselineLength ?? '?'} 字符，${total} 条全部匹配`,
  },
  format_check: {
    desc: '按 GS1 AI 规则解析每条码，支持 (01)GTIN / (21)Serial 等段',
    passedText: (_s, total) => `${total} 条均符合 GS1 标准`,
  },
}

export function StepRow({ stage, state, totalCodes }: {
  stage: AnalysisStage; state: AnalysisStepState; totalCodes: number
}) {
  let icon, color, text
  if (state.status === 'pending') {
    icon = <span style={{ color: '#d9d9d9', fontSize: 18 }}>○</span>; color = '#999'; text = '等待'
  } else if (state.status === 'running') {
    icon = <LoadingOutlined style={{ color: '#1677ff', fontSize: 16 }} spin />; color = '#1677ff'; text = '进行中...'
  } else if (state.status === 'passed') {
    icon = <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />; color = '#52c41a'
    text = STAGE_DETAIL[stage].passedText(state, totalCodes)
  } else {
    icon = <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />; color = '#ff4d4f'
    const baselinePart = state.stats?.baselineLength != null ? `基准 ${state.stats.baselineLength} 字符，` : ''
    text = `${baselinePart}发现 ${state.anomalies?.length ?? 0} 条异常 → 详见下方异常表`
  }

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8,
      background: state.status === 'failed' ? '#fff1f0' : state.status === 'passed' ? '#f6ffed' : state.status === 'running' ? '#e6f4ff' : '#fafafa',
      border: '1px solid ' + (state.status === 'failed' ? '#ffccc7' : state.status === 'passed' ? '#b7eb8f' : state.status === 'running' ? '#91caff' : '#f0f0f0'),
    }}>
      <span style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: state.status === 'failed' ? '#cf1322' : '#262626' }}>{STAGE_LABELS[stage]}</span>
          <span style={{ fontSize: 12, color, fontWeight: 500 }}>{text}</span>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 2, display: 'block' }}>
          {STAGE_DETAIL[stage].desc}
        </Typography.Text>
      </div>
    </div>
  )
}

function AnomalyTable({ anomalies }: { anomalies: AnalysisAnomaly[] }) {
  return (
    <Table
      dataSource={anomalies} rowKey="rowIndex"
      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100] }}
      size="small" scroll={{ y: 400 }}
      columns={[
        { title: '行号', dataIndex: 'rowIndex', width: 70, render: (v: number) => v + 1 },
        {
          title: '类型', dataIndex: 'kind', width: 130,
          render: (k: AnalysisAnomaly['kind']) => {
            const map = { file_duplicate: { text: '文件内重复', color: 'orange' }, length_mismatch: { text: '长度不符', color: 'orange' }, format_invalid: { text: 'GS1 格式错', color: 'red' } }
            return <Tag color={map[k].color}>{map[k].text}</Tag>
          },
        },
        { title: '原因', dataIndex: 'reasonText', width: 280 },
        {
          title: 'DMC', dataIndex: 'code', ellipsis: true,
          render: (c: string) => <Typography.Text code copyable={{ text: c }} style={{ fontSize: 11 }}>{c.length > 60 ? c.slice(0, 60) + '...' : c}</Typography.Text>,
        },
      ]}
    />
  )
}

// ─── 配置 + 导出 ───

export function ConfigureView({
  parsed, analysis, assigned, startSeq, setStartSeq,
  previewCount, setPreviewCount, batchName, setBatchName,
  includeSeq, setIncludeSeq,
  selectedTenant, saving, onExport,
  showBackendVerify = true,
}: {
  parsed: ParsedDmcFile; analysis: AnalysisResult
  assigned: Array<{ seq: string; dmc: string }>
  startSeq: string; setStartSeq: (v: string) => void
  previewCount: number; setPreviewCount: (v: number) => void
  batchName: string; setBatchName: (v: string) => void
  includeSeq: boolean; setIncludeSeq: (v: boolean) => void
  selectedTenant: AdminTenantRow | null
  saving: boolean; onExport: (format: 'csv' | 'xlsx' | 'txt') => void
  /** 是否显示「验证 DMC 有效性」(后端 round-trip,需登录)。免登录独立页传 false */
  showBackendVerify?: boolean
}) {
  const total = assigned.length
  const lastSeq = total > 0 ? assigned[total - 1].seq : ''
  const previewSlice = useMemo(
    () => assigned.slice(0, Math.min(previewCount, total)),
    [assigned, previewCount, total],
  )

  // 验证模态状态
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [verifyPhase, setVerifyPhase] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [verifyProgress, setVerifyProgress] = useState<{ done: number; total: number; ok: number; mismatch: number } | null>(null)
  const [verifyResult, setVerifyResult] = useState<{ ok: number; mismatch: number; mismatchSamples: VerifyMismatch[]; durationMs: number } | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  // 打印预览模态
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleVerify = async () => {
    setVerifyOpen(true)
    setVerifyPhase('running')
    setVerifyProgress({ done: 0, total: assigned.length, ok: 0, mismatch: 0 })
    setVerifyResult(null)
    setVerifyError(null)
    try {
      const result = await verifyDmc(assigned.map((a) => a.dmc), {
        onProgress: (p) => setVerifyProgress(p),
      })
      setVerifyResult(result)
      setVerifyPhase('done')
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : '验证失败')
      setVerifyPhase('failed')
    }
  }

  return (
    <>
      <Alert
        type="success" showIcon
        message={
          <span>
            文件 {parsed.filename} 校验通过，共 {total} 条
            {selectedTenant && (
              <span style={{ marginLeft: 8, color: '#6366f1', fontWeight: 600 }}>
                · 将保存到「{selectedTenant.name}」
              </span>
            )}
          </span>
        }
        style={{ marginBottom: 16 }}
      />

      <Collapse size="small" defaultActiveKey={[]} style={{ marginBottom: 16 }}
        items={[{
          key: 'steps',
          label: <span style={{ fontSize: 13 }}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />校验详情（3 步全部通过）</span>,
          children: (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {STAGE_ORDER.map((stage) => (
                <StepRow key={stage} stage={stage} state={analysis.steps[stage]} totalCodes={parsed.total} />
              ))}
            </Space>
          ),
        }]}
      />

      <Card
        size="small"
        title="序号配置"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            <span style={{ fontSize: 12, color: '#666' }}>导出包含序号</span>
            <Switch checked={includeSeq} onChange={setIncludeSeq} />
          </Space>
        }
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', opacity: includeSeq ? 1 : 0.45 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>起始序号</div>
            <Input
              value={startSeq}
              onChange={(e) => setStartSeq(e.target.value)}
              placeholder="ADU000001"
              style={{ width: 220 }}
              disabled={!includeSeq}
            />
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
              自动识别"前缀 + 末尾数字"，递增补零
            </Typography.Text>
          </div>
          <Divider type="vertical" style={{ height: 50 }} />
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>第一条</div>
            <Typography.Text code style={{ fontSize: 14 }}>{assigned[0]?.seq ?? '—'}</Typography.Text>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>最后一条</div>
            <Typography.Text code style={{ fontSize: 14 }}>{lastSeq || '—'}</Typography.Text>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>预览前 N 条</div>
            <InputNumber min={5} max={500} value={previewCount} onChange={(v) => setPreviewCount(v ?? 10)} style={{ width: 100 }} />
          </div>
        </div>
        {!includeSeq && (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 12 }}>
            ⓘ 已关闭序号:导出文件只含 DMC 一列。{selectedTenant ? '后端仍会保存序号(以备日后查询/重导)。' : ''}
          </Typography.Text>
        )}
        {selectedTenant && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>码表名称（保存到工厂时显示）</div>
            <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="自动填入文件名，可修改" style={{ width: 320 }} />
          </div>
        )}
      </Card>

      <Card
        size="small"
        title={`预览（显示前 ${previewSlice.length} 条，共 ${total} 条）`}
        extra={
          <Space>
            <Tooltip title="渲染前 N 条 DMC 矩阵图,打印后用扫码枪手动扫几个,跟序号对应的源码核对一致即可发厂">
              <Button
                icon={<PrinterOutlined />}
                onClick={() => setPreviewOpen(true)}
                style={{ background: '#fffbe6', borderColor: '#faad14', color: '#d48806' }}
              >
                预览 / 扫码验证
              </Button>
            </Tooltip>
            {showBackendVerify && (
              <Tooltip title="对每条码做 encode→decode round-trip。通过 = 工厂打出来扫码机一定能扫回原码">
                <Button
                  icon={<SafetyCertificateOutlined />}
                  onClick={handleVerify}
                  style={{ background: '#f6ffed', borderColor: '#52c41a', color: '#389e0d' }}
                >
                  验证 DMC 有效性
                </Button>
              </Tooltip>
            )}
            <Tooltip title="标签厂/打印机常用格式,纯文本无 escape,码原样输出">
              <Button icon={<DownloadOutlined />} loading={saving} onClick={() => onExport('txt')}>
                导出 TXT{selectedTenant ? ' + 保存' : ''}
              </Button>
            </Tooltip>
            <Tooltip title="RFC 4180 标准 CSV,含 &quot; 的码会按规则 escape 成 &quot;&quot;">
              <Button icon={<DownloadOutlined />} loading={saving} onClick={() => onExport('csv')}>
                导出 CSV{selectedTenant ? ' + 保存' : ''}
              </Button>
            </Tooltip>
            <Button type="primary" icon={selectedTenant ? <SaveOutlined /> : <DownloadOutlined />} loading={saving} onClick={() => onExport('xlsx')}>
              导出 XLSX{selectedTenant ? ' + 保存' : ''}
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={previewSlice} rowKey="seq" pagination={false} size="small"
          columns={[
            { title: '#', width: 60, render: (_v, _r, idx) => idx + 1 },
            ...(includeSeq
              ? [{
                  title: '序号',
                  dataIndex: 'seq',
                  width: 220,
                  render: (s: string) => <Typography.Text code style={{ fontSize: 13 }}>{s}</Typography.Text>,
                }]
              : []),
            { title: 'DMC 码', dataIndex: 'dmc', ellipsis: true, render: (c: string) => <Typography.Text code style={{ fontSize: 11 }}>{c.length > 80 ? c.slice(0, 80) + '...' : c}</Typography.Text> },
          ]}
        />
      </Card>

      <VerifyModal
        open={verifyOpen}
        phase={verifyPhase}
        progress={verifyProgress}
        result={verifyResult}
        error={verifyError}
        onClose={() => setVerifyOpen(false)}
      />

      <DmcPrintPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        codes={assigned}
      />
    </>
  )
}

// ─── 验证 DMC 有效性 模态 ───

function VerifyModal({
  open, phase, progress, result, error, onClose,
}: {
  open: boolean
  phase: 'idle' | 'running' | 'done' | 'failed'
  progress: { done: number; total: number; ok: number; mismatch: number } | null
  result: { ok: number; mismatch: number; mismatchSamples: VerifyMismatch[]; durationMs: number } | null
  error: string | null
  onClose: () => void
}) {
  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0
  const allPassed = phase === 'done' && result?.mismatch === 0

  return (
    <Modal
      open={open}
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
          DMC 有效性验证 (encode → decode round-trip)
        </Space>
      }
      onCancel={phase === 'running' ? undefined : onClose}
      closable={phase !== 'running'}
      maskClosable={phase !== 'running'}
      footer={phase === 'running' ? null : (
        <Button type="primary" onClick={onClose}>
          {allPassed ? '完成,可送厂' : '关闭'}
        </Button>
      )}
      width={720}
    >
      {phase === 'running' && progress && (
        <div>
          <Typography.Paragraph>
            正在用 libdmtx 对 <b>{progress.total}</b> 条码做 encode → decode round-trip。
            <br />
            通过 = 工厂打印后扫码机一定能扫回原字节。
          </Typography.Paragraph>
          <Progress percent={percent} status="active" />
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <Typography.Text>已检 {progress.done} / {progress.total}</Typography.Text>
            <Typography.Text type="success" style={{ marginLeft: 16 }}>
              通过 {progress.ok}
            </Typography.Text>
            {progress.mismatch > 0 && (
              <Typography.Text type="danger" style={{ marginLeft: 16, fontWeight: 600 }}>
                不通过 {progress.mismatch}
              </Typography.Text>
            )}
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <div>
          {allPassed ? (
            <Alert
              type="success" showIcon
              message={`全部 ${result.ok} 条通过 ✓`}
              description={`耗时 ${(result.durationMs / 1000).toFixed(1)}s。可安全送给标签厂打印。`}
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Alert
              type="error" showIcon
              message={`发现 ${result.mismatch} 条无法 round-trip 的码`}
              description="这些码用 libdmtx 编码后再解码,得不到原字节。送厂打印后扫码机可能扫不出或扫错。请修复后再导出。"
              style={{ marginBottom: 16 }}
            />
          )}

          {result.mismatchSamples.length > 0 && (
            <Card size="small" title={`失败样例 (前 ${result.mismatchSamples.length} 条)`}>
              <Table
                size="small"
                dataSource={result.mismatchSamples}
                rowKey="row"
                pagination={false}
                columns={[
                  { title: '行号', dataIndex: 'row', width: 80 },
                  {
                    title: '源码',
                    dataIndex: 'source',
                    ellipsis: true,
                    render: (s: string) => (
                      <Typography.Text code copyable={{ text: s }} style={{ fontSize: 11 }}>
                        {s.length > 60 ? s.slice(0, 60) + '...' : s}
                      </Typography.Text>
                    ),
                  },
                  {
                    title: '解码结果',
                    dataIndex: 'decoded',
                    ellipsis: true,
                    render: (d: string | null) => (
                      <Typography.Text code style={{ fontSize: 11, color: '#cf1322' }}>
                        {d === '__NO_DECODE__' ? '(无法解码)' : d}
                      </Typography.Text>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>
      )}

      {phase === 'failed' && (
        <Alert
          type="error" showIcon
          message="验证调用失败"
          description={error || '未知错误'}
        />
      )}
    </Modal>
  )
}
