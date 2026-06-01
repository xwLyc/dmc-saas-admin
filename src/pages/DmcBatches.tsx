/**
 * DMC 码表生成工具
 *
 * 流程:
 *   Step 1. 关联工厂 (可跳过)
 *   Step 2. 上传 DMC 文件 + 校验
 *   Step 3. 配置序号 + 导出 (有工厂时同时保存到后端)
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Card, Button, Upload, Steps, Input, Table, Tag, Space, Alert,
  Typography, Divider, message, InputNumber, Collapse, Select, Spin,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  CloudUploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  LoadingOutlined, DownloadOutlined, ReloadOutlined, SaveOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { parseDmcFile, exportSeqDmc, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs } from '@/lib/dmc/sequence'
import {
  type AnalysisResult, type AnalysisStage, type AnalysisStepState, type AnalysisAnomaly,
  STAGE_LABELS, STAGE_ORDER,
} from '@/lib/dmc/types'
import { listTenants, createDmcBatch } from '@/services/admin'
import type { TenantId, AdminTenantRow } from '@dmc/contracts'

type Phase = 'select-tenant' | 'upload' | 'analyzing' | 'failed' | 'configure'

export default function DmcBatchesPage() {
  const [phase, setPhase] = useState<Phase>('select-tenant')
  const [parsed, setParsed] = useState<ParsedDmcFile | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [startSeq, setStartSeq] = useState('ADU000001')
  const [previewCount, setPreviewCount] = useState(10)
  const [selectedTenant, setSelectedTenant] = useState<AdminTenantRow | null>(null)
  const [batchName, setBatchName] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputResetKey = useRef(0)

  // ─── 上传 + 解析 + 校验 ───
  const handleFile = async (file: File) => {
    try {
      setPhase('analyzing')
      const p = await parseDmcFile(file)
      setParsed(p)
      const result = analyzeDmcCodes(p.codes.map((code) => ({ code })))
      setAnalysis(result)
      setPhase(result.passed ? 'configure' : 'failed')
      if (result.passed) {
        setBatchName(file.name.replace(/\.(csv|xlsx|xls)$/i, ''))
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '文件解析失败')
      setPhase('upload')
    }
  }

  const handleReset = () => {
    setPhase('select-tenant')
    setParsed(null)
    setAnalysis(null)
    setStartSeq('ADU000001')
    setSelectedTenant(null)
    setBatchName('')
    fileInputResetKey.current += 1
  }

  // ─── 序号预览 ───
  const assigned = useMemo(() => {
    if (!analysis?.passed || !analysis.uniqueCodes.length) return []
    return assignSeqs(analysis.uniqueCodes, startSeq)
  }, [analysis, startSeq])

  // ─── 导出 (+ 保存) ───
  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (assigned.length === 0 || !parsed) return

    const baseName = parsed.filename.replace(/\.(csv|xlsx|xls)$/i, '') + '_带序号'
    exportSeqDmc(assigned, baseName, format)
    message.success(`已导出 ${assigned.length} 条 ${format.toUpperCase()}`)

    if (!selectedTenant) return

    setSaving(true)
    try {
      await createDmcBatch({
        tenantId: selectedTenant.id as TenantId,
        name: batchName.trim() || baseName,
        filename: parsed.filename,
        startSeq: assigned[0]?.seq ?? startSeq,
        endSeq: assigned[assigned.length - 1]?.seq ?? '',
        codes: assigned.map((a) => ({ seq: a.seq, dmc: a.dmc })),
      })
      message.success(`码表已保存到"${selectedTenant.name}"，工厂桌面端可直接拉取`)
    } catch (err: any) {
      message.error(`保存失败：${err?.message ?? '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const uploadProps: UploadProps = {
    accept: '.csv,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => { handleFile(file); return false },
  }

  const stepIndex =
    phase === 'select-tenant' ? 0
    : phase === 'upload' || phase === 'analyzing' || phase === 'failed' ? 1
    : 2

  return (
    <div>
      <Card
        title={
          <span>
            DMC 码表生成工具
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              客户给的纯 DMC 配序号 → 分发给标签厂 + 工厂，三方对齐
            </Typography.Text>
          </span>
        }
        extra={phase !== 'select-tenant' && (
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重新开始</Button>
        )}
        styles={{ body: { padding: 24 } }}
      >
        <Steps
          current={stepIndex}
          items={[
            { title: '关联工厂' },
            { title: '上传 + 校验' },
            { title: '配置序号 + 导出' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {/* Step 1: 关联工厂 */}
        {phase === 'select-tenant' && (
          <SelectTenantStep
            selected={selectedTenant}
            onSelect={setSelectedTenant}
            onNext={() => setPhase('upload')}
            onSkip={() => { setSelectedTenant(null); setPhase('upload') }}
          />
        )}

        {/* Step 2: 上传 */}
        {phase === 'upload' && (
          <div>
            {selectedTenant && (
              <Alert
                type="info"
                showIcon
                message={`已关联工厂：${selectedTenant.name}（${selectedTenant.contactPhone}）`}
                style={{ marginBottom: 16 }}
              />
            )}
            <Upload.Dragger {...uploadProps} key={fileInputResetKey.current}>
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined style={{ color: '#6366f1' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
              <p className="ant-upload-hint">
                支持 CSV / XLSX / XLS。文件应包含一列 DMC 码（列名可以是 "DMC" / "DMC码" / "code" 或纯无表头）。
              </p>
            </Upload.Dragger>
          </div>
        )}

        {/* Step 2: 校验中 / 失败 */}
        {(phase === 'analyzing' || phase === 'failed') && analysis && parsed && (
          <AnalysisView parsed={parsed} analysis={analysis} onRetry={() => setPhase('upload')} />
        )}

        {/* Step 3: 配置 + 导出 */}
        {phase === 'configure' && analysis?.passed && parsed && (
          <ConfigureView
            parsed={parsed}
            analysis={analysis}
            assigned={assigned}
            startSeq={startSeq}
            setStartSeq={setStartSeq}
            previewCount={previewCount}
            setPreviewCount={setPreviewCount}
            batchName={batchName}
            setBatchName={setBatchName}
            selectedTenant={selectedTenant}
            saving={saving}
            onExport={handleExport}
          />
        )}
      </Card>
    </div>
  )
}

// ─── Step 1: 关联工厂 ───

function SelectTenantStep({
  selected, onSelect, onNext, onSkip,
}: {
  selected: AdminTenantRow | null
  onSelect: (t: AdminTenantRow | null) => void
  onNext: () => void
  onSkip: () => void
}) {
  const [tenants, setTenants] = useState<AdminTenantRow[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初始加载最近 20 个工厂
  useEffect(() => {
    setLoading(true)
    listTenants({ page: 1, pageSize: 20 })
      .then((r) => setTenants(r.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = (kw: string) => {
    setKeyword(kw)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setLoading(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const resp = await listTenants({ page: 1, pageSize: 20, search: kw || undefined })
        setTenants(resp.items)
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索工厂名或手机号..."
          value={keyword}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
          style={{ width: '100%' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 360, overflowY: 'auto' }}>
          {tenants.map((t) => {
            const isSelected = selected?.id === t.id
            return (
              <div
                key={t.id}
                onClick={() => onSelect(isSelected ? null : t)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${isSelected ? '#6366f1' : '#f0f0f0'}`,
                  background: isSelected ? '#f5f3ff' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {t.contactPhone}
                    {t.region ? ` · ${t.region}` : ''}
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 99,
                      background: t.status === 'active' ? '#f6ffed' : '#fafafa',
                      border: `1px solid ${t.status === 'active' ? '#b7eb8f' : '#d9d9d9'}`,
                      color: t.status === 'active' ? '#52c41a' : '#999',
                    }}>
                      {t.status === 'active' ? '订阅中' : t.status === 'trial' ? '试用' : t.status}
                    </span>
                  </div>
                </div>
                {isSelected && <CheckCircleOutlined style={{ color: '#6366f1', fontSize: 18 }} />}
              </div>
            )
          })}
          {tenants.length === 0 && !loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>
              未找到工厂，请先在工厂管理中创建
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <Button
          type="primary"
          disabled={!selected}
          icon={<RightOutlined />}
          onClick={onNext}
        >
          下一步{selected ? `（已选：${selected.name}）` : ''}
        </Button>
        <Button onClick={onSkip} style={{ color: '#999' }}>
          跳过，不关联工厂
        </Button>
      </div>
    </div>
  )
}

// ─── 校验结果展示 ───

function AnalysisView({
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

function StepRow({ stage, state, totalCodes }: {
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

// ─── Step 3: 配置 + 导出 ───

function ConfigureView({
  parsed, analysis, assigned, startSeq, setStartSeq,
  previewCount, setPreviewCount, batchName, setBatchName,
  selectedTenant, saving, onExport,
}: {
  parsed: ParsedDmcFile; analysis: AnalysisResult
  assigned: Array<{ seq: string; dmc: string }>
  startSeq: string; setStartSeq: (v: string) => void
  previewCount: number; setPreviewCount: (v: number) => void
  batchName: string; setBatchName: (v: string) => void
  selectedTenant: AdminTenantRow | null
  saving: boolean; onExport: (format: 'csv' | 'xlsx') => void
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

      <Card size="small" title="序号配置" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>起始序号</div>
            <Input value={startSeq} onChange={(e) => setStartSeq(e.target.value)} placeholder="ADU000001" style={{ width: 220 }} />
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
            <Button icon={<DownloadOutlined />} loading={saving} onClick={() => onExport('csv')}>
              导出 CSV{selectedTenant ? ' + 保存' : ''}
            </Button>
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
            { title: '序号', dataIndex: 'seq', width: 220, render: (s: string) => <Typography.Text code style={{ fontSize: 13 }}>{s}</Typography.Text> },
            { title: 'DMC 码', dataIndex: 'dmc', ellipsis: true, render: (c: string) => <Typography.Text code style={{ fontSize: 11 }}>{c.length > 80 ? c.slice(0, 80) + '...' : c}</Typography.Text> },
          ]}
        />
      </Card>
    </>
  )
}
