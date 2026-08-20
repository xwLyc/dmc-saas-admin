/**
 * DMC 码表生成工具
 *
 * 流程:
 *   Step 1. 关联工厂 (可跳过)
 *   Step 2. 上传 DMC 文件 + 校验
 *   Step 3. 配置序号 + 导出 (有工厂时同时保存到后端)
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, Button, Upload, Steps, Input, Alert, Typography, message, Spin, Select } from 'antd'
import type { UploadProps } from 'antd'
import {
  CloudUploadOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { parseDmcFile, exportSeqDmc, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs } from '@/lib/dmc/sequence'
import { type AnalysisResult } from '@/lib/dmc/types'
import { listTenants, listCustomers, createDmcBatch, checkDmcDuplicates } from '@/services/admin'
import type {
  TenantId,
  CustomerId,
  AdminTenantRow,
  CustomerRow,
  CheckDmcDuplicatesResponse,
} from '@dmc/contracts'
import { AnalysisView, ConfigureView } from './dmc/shared'
import { DuplicateReportView } from './dmc/DuplicateReport'
import { WorkspaceTableTitle } from '@/components/WorkspacePage'

// dup-checking / dup-failed:选了客户才有的两步——跟该客户历史码表比对。
// 没选客户就没有比对基准,直接进 configure(跟老流程一致)。
type Phase =
  | 'select-tenant'
  | 'upload'
  | 'analyzing'
  | 'failed'
  | 'dup-checking'
  | 'dup-failed'
  | 'configure'

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
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [dupResult, setDupResult] = useState<CheckDmcDuplicatesResponse | null>(null)
  const [batchName, setBatchName] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputResetKey = useRef(0)

  // ─── 上传 + 解析 + 校验(+ 选了客户则查重) ───
  const handleFile = async (file: File) => {
    try {
      setPhase('analyzing')
      const p = await parseDmcFile(file)
      setParsed(p)

      // 文件本身带序号列(自己导出的回传 / 客户给的带号码单)→ 用它的首行序号续上。
      // 不接的话会默默从 ADU000001 重编:码没变但序号整体平移,而工厂的标签和
      // 装箱记录都是按原序号走的,一重导就对不上。没带序号的文件不动用户当前值。
      const effectiveStartSeq = p.importedStartSeq ?? startSeq
      if (p.importedStartSeq) setStartSeq(p.importedStartSeq)

      const result = analyzeDmcCodes(p.codes.map((code) => ({ code })))
      setAnalysis(result)
      if (!result.passed) {
        setPhase('failed')
        return
      }
      setBatchName(file.name.replace(/\.(csv|txt|xlsx|xls)$/i, ''))

      // 没选客户 → 没有查重基准,走老流程直接进配置。
      // 选了客户 → 拿这批码跟该客户历史所有码表比对:客户把同一批码改个文件名
      // 重发是真实会发生的失误,而重复码印出去 = 两件实物挂同一个 ЧЗ 身份。
      if (!selectedCustomer) {
        setDupResult(null)
        setPhase('configure')
        return
      }

      setPhase('dup-checking')
      // 用局部变量,不读 startSeq state —— setStartSeq 是异步的,这里读到的还是旧值,
      // 会拿错序号去查重(dmc 一样但 seq 对不上,后端记的重复位置就偏了)。
      const seqPreview = assignSeqs(result.uniqueCodes, effectiveStartSeq)
      const dup = await checkDmcDuplicates({
        customerId: selectedCustomer.id as CustomerId,
        codes: seqPreview.map((a) => ({ seq: a.seq, dmc: a.dmc })),
      })
      setDupResult(dup)
      setPhase(dup.ok ? 'configure' : 'dup-failed')
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
    setSelectedCustomer(null)
    setDupResult(null)
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
        customerId: selectedCustomer ? (selectedCustomer.id as CustomerId) : undefined,
        name: batchName.trim() || baseName,
        filename: parsed.filename,
        startSeq: assigned[0]?.seq ?? startSeq,
        endSeq: assigned[assigned.length - 1]?.seq ?? '',
        codes: assigned.map((a) => ({ seq: a.seq, dmc: a.dmc })),
      })
      message.success(
        `码表已保存到"${selectedTenant.name}"，工厂桌面端可直接拉取` +
          (selectedCustomer ? `；已归入客户「${selectedCustomer.name}」档案` : ''),
      )
    } catch (err: any) {
      // 后端落库前会再查一次重(防预检和提交之间又插进同样的码),
      // 撞上就是 409 DMC_DUPLICATE,这里把明细摊开给人看
      const detail = err?.response?.data
      if (detail?.code === 'DMC_DUPLICATE') {
        setDupResult(detail.details ?? null)
        setPhase('dup-failed')
        message.error('保存被拒绝：发现重复码')
        return
      }
      message.error(`保存失败：${err?.message ?? '未知错误'}`)
    } finally {
      setSaving(false)
    }
  }

  const uploadProps: UploadProps = {
    accept: '.csv,.txt,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => {
      handleFile(file)
      return false
    },
  }

  const stepIndex =
    phase === 'select-tenant'
      ? 0
      : phase === 'upload' ||
          phase === 'analyzing' ||
          phase === 'failed' ||
          phase === 'dup-checking' ||
          phase === 'dup-failed'
        ? 1
        : 2

  return (
    <div className="dmc-page-stack">
      <Card
        className="dmc-workflow-card"
        title={<WorkspaceTableTitle title="处理流程" description="关联对象、校验查重、配置导出" />}
        extra={
          phase !== 'select-tenant' && (
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重新开始
            </Button>
          )
        }
      >
        <Steps
          className="dmc-workflow-steps"
          current={stepIndex}
          items={[
            { title: '关联工厂 + 客户' },
            { title: '上传 + 校验 + 查重' },
            { title: '配置序号 + 导出' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {/* Step 1: 关联工厂 + 俄罗斯客户 */}
        {phase === 'select-tenant' && (
          <SelectTenantStep
            selected={selectedTenant}
            onSelect={setSelectedTenant}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            onNext={() => setPhase('upload')}
            onSkip={() => {
              setSelectedTenant(null)
              setSelectedCustomer(null)
              setPhase('upload')
            }}
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
            <Alert
              type={selectedCustomer ? 'success' : 'warning'}
              showIcon
              message={
                selectedCustomer
                  ? `将跟客户「${selectedCustomer.name}」历史 ${selectedCustomer.codeCount.toLocaleString()} 条码查重`
                  : '未选客户 — 不做跨码表查重'
              }
              description={
                selectedCustomer
                  ? undefined
                  : '只能查出这份文件内部的重复；客户把同一批码重发一次将无法发现。建议返回上一步选择客户。'
              }
              style={{ marginBottom: 16 }}
            />
            <Upload.Dragger {...uploadProps} key={fileInputResetKey.current}>
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined style={{ color: '#316eea' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
              <p className="ant-upload-hint">
                支持 CSV / XLSX / XLS。文件应包含一列 DMC 码（列名可以是 "DMC" / "DMC码" / "code"
                或纯无表头）。
              </p>
            </Upload.Dragger>
          </div>
        )}

        {/* Step 2: 校验中 / 失败 */}
        {(phase === 'analyzing' || phase === 'failed') && analysis && parsed && (
          <AnalysisView parsed={parsed} analysis={analysis} onRetry={() => setPhase('upload')} />
        )}

        {/* Step 2: 查重中 */}
        {phase === 'dup-checking' && (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin size="large" />
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              正在跟客户「{selectedCustomer?.name}」的历史码表比对…
            </Typography.Paragraph>
          </div>
        )}

        {/* Step 2: 查重不通过 */}
        {phase === 'dup-failed' && dupResult && (
          <DuplicateReportView
            result={dupResult}
            customerName={selectedCustomer?.name ?? ''}
            onRetry={() => setPhase('upload')}
          />
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

// ─── Step 1: 关联工厂 + 俄罗斯客户 ───

function SelectTenantStep({
  selected,
  onSelect,
  selectedCustomer,
  onSelectCustomer,
  onNext,
  onSkip,
}: {
  selected: AdminTenantRow | null
  onSelect: (t: AdminTenantRow | null) => void
  selectedCustomer: CustomerRow | null
  onSelectCustomer: (c: CustomerRow | null) => void
  onNext: () => void
  onSkip: () => void
}) {
  const [tenants, setTenants] = useState<AdminTenantRow[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [customers, setCustomers] = useState<CustomerRow[]>([])

  // 初始加载最近 20 个工厂
  useEffect(() => {
    setLoading(true)
    listTenants({ page: 1, pageSize: 20 })
      .then((r) => setTenants(r.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 客户列表(查重基准的来源)。数量远少于工厂,一次拉 100 个够用,不做搜索分页。
  useEffect(() => {
    listCustomers({ page: 1, pageSize: 100 })
      .then((r) => setCustomers(r.items))
      .catch(() => {})
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
      {/* 俄罗斯客户 —— 查重的基准。不选就只能查文件内重复,查不出客户重发同一批码 */}
      <div style={{ marginBottom: 20 }}>
        <Typography.Text strong>俄罗斯客户（码表来源）</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          选定后，这批码会跟该客户历史给过的所有码表比对，重复则拒绝入库。
          不选则只能查出本文件内部的重复。
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          allowClear
          showSearch
          placeholder="选择客户（可不选）"
          optionFilterProp="label"
          value={selectedCustomer?.id}
          onChange={(id) => onSelectCustomer(customers.find((c) => c.id === id) ?? null)}
          options={customers.map((c) => ({
            value: c.id,
            label: c.shortName ? `${c.name}（${c.shortName}）` : c.name,
          }))}
          notFoundContent={
            <Typography.Text type="secondary">还没有客户，先去「俄罗斯客户」页新建</Typography.Text>
          }
        />
        {selectedCustomer && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            该客户档案：{selectedCustomer.batchCount} 张码表 /{' '}
            {selectedCustomer.codeCount.toLocaleString()} 条码
          </Typography.Text>
        )}
      </div>

      <Typography.Text strong>关联工厂（码表发给谁用）</Typography.Text>
      <div style={{ margin: '8px 0 16px' }}>
        <Input
          placeholder="搜索工厂名或手机号..."
          value={keyword}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
          style={{ width: '100%' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 20,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {tenants.map((t) => {
            const isSelected = selected?.id === t.id
            return (
              <div
                key={t.id}
                onClick={() => onSelect(isSelected ? null : t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: `1px solid ${isSelected ? '#316eea' : '#e4eaf2'}`,
                  background: isSelected ? '#edf3ff' : '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {t.contactPhone}
                    {t.region ? ` · ${t.region}` : ''}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        padding: '1px 6px',
                        borderRadius: 99,
                        background: t.status === 'active' ? '#f6ffed' : '#fafafa',
                        border: `1px solid ${t.status === 'active' ? '#b7eb8f' : '#d9d9d9'}`,
                        color: t.status === 'active' ? '#52c41a' : '#999',
                      }}
                    >
                      {t.status === 'active' ? '订阅中' : t.status === 'trial' ? '试用' : t.status}
                    </span>
                  </div>
                </div>
                {isSelected && <CheckCircleOutlined style={{ color: '#316eea', fontSize: 18 }} />}
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
        <Button type="primary" disabled={!selected} icon={<RightOutlined />} onClick={onNext}>
          下一步{selected ? `（已选：${selected.name}）` : ''}
        </Button>
        <Button onClick={onSkip} style={{ color: '#999' }}>
          跳过，不关联工厂
        </Button>
      </div>
    </div>
  )
}
