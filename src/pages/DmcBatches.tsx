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
  Card, Button, Upload, Steps, Input, Alert, Typography, message, Spin,
} from 'antd'
import type { UploadProps } from 'antd'
import {
  CloudUploadOutlined, CheckCircleOutlined, ReloadOutlined, RightOutlined,
} from '@ant-design/icons'
import { parseDmcFile, exportSeqDmc, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs } from '@/lib/dmc/sequence'
import { type AnalysisResult } from '@/lib/dmc/types'
import { listTenants, createDmcBatch } from '@/services/admin'
import type { TenantId, AdminTenantRow } from '@dmc/contracts'
import { AnalysisView, ConfigureView } from './dmc/shared'

type Phase = 'select-tenant' | 'upload' | 'analyzing' | 'failed' | 'configure'

export default function DmcBatchesPage() {
  const [phase, setPhase] = useState<Phase>('select-tenant')
  const [parsed, setParsed] = useState<ParsedDmcFile | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [startSeq, setStartSeq] = useState('ADU000001')
  const [previewCount, setPreviewCount] = useState(10)
  /** 是否在导出文件里带序号列。关掉只导 DMC 一列(标签厂偶尔需要)。
   *  后端 createDmcBatch 仍然保存 seq,跟导出文件解耦——以后想再导带序号版直接重导。 */
  const [includeSeq, setIncludeSeq] = useState(true)
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
        setBatchName(file.name.replace(/\.(csv|txt|xlsx|xls)$/i, ''))
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
  const handleExport = async (format: 'csv' | 'xlsx' | 'txt') => {
    if (assigned.length === 0 || !parsed) return

    const baseName =
      parsed.filename.replace(/\.(csv|txt|xlsx|xls)$/i, '') + (includeSeq ? '_带序号' : '_仅DMC')
    exportSeqDmc(assigned, baseName, format, { includeSeq })
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
    accept: '.csv,.txt,.xlsx,.xls',
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
            includeSeq={includeSeq}
            setIncludeSeq={setIncludeSeq}
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
