/**
 * DMC 码表生成工具 —— 免登录独立页(给公司内部人员用)。
 *
 * 跟后管内页 DmcBatches 的区别:
 *   - 不选工厂、不存后端、不套 ProLayout(路由 layout:false)
 *   - 纯前端:上传 → 3 步校验 → 配序号 → 导出 CSV/TXT/XLSX + 客户端打印/扫码核对
 *   - 不含后端 round-trip 校验(showBackendVerify=false,那个要 JWT)
 *
 * 全程零后端请求,所以无需登录也能跑。校验/配置视图复用 ./dmc/shared。
 * 访问:/dmc-admin/tool
 */

import { useState, useMemo, useRef } from 'react'
import { Card, Button, Upload, Typography, message } from 'antd'
import type { UploadProps } from 'antd'
import { CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons'
import { parseDmcFile, exportSeqDmc, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs } from '@/lib/dmc/sequence'
import { type AnalysisResult } from '@/lib/dmc/types'
import { AnalysisView, ConfigureView } from './dmc/shared'

type Phase = 'upload' | 'analyzing' | 'failed' | 'configure'

export default function DmcToolPage() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [parsed, setParsed] = useState<ParsedDmcFile | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [startSeq, setStartSeq] = useState('ADU000001')
  const [previewCount, setPreviewCount] = useState(10)
  const [includeSeq, setIncludeSeq] = useState(true)
  // batchName 仅 ConfigureView 接口需要(后管存后端时用),独立页不落库,占位即可
  const [batchName, setBatchName] = useState('')
  const fileInputResetKey = useRef(0)

  // ─── 上传 + 解析 + 校验(纯前端)───
  const handleFile = async (file: File) => {
    try {
      setPhase('analyzing')
      const p = await parseDmcFile(file)
      setParsed(p)
      // 带序号列的文件 → 用首行序号预填,别从 ADU000001 重编(详见 DmcBatches.handleFile)
      if (p.importedStartSeq) setStartSeq(p.importedStartSeq)
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
    setBatchName('')
    fileInputResetKey.current += 1
  }

  // ─── 序号预览 ───
  const assigned = useMemo(() => {
    if (!analysis?.passed || !analysis.uniqueCodes.length) return []
    return assignSeqs(analysis.uniqueCodes, startSeq)
  }, [analysis, startSeq])

  // ─── 导出(纯前端,不落库)───
  const handleExport = (format: 'csv' | 'xlsx' | 'txt') => {
    if (assigned.length === 0 || !parsed) return
    const baseName =
      parsed.filename.replace(/\.(csv|txt|xlsx|xls)$/i, '') + (includeSeq ? '_带序号' : '_仅DMC')
    exportSeqDmc(assigned, baseName, format, { includeSeq })
    message.success(`已导出 ${assigned.length} 条 ${format.toUpperCase()}`)
  }

  const uploadProps: UploadProps = {
    accept: '.csv,.txt,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => { handleFile(file); return false },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: '32px 16px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>DMC 码表生成工具</Typography.Title>
          <Typography.Text type="secondary">
            上传纯 DMC 文件 → 自动校验 → 配置序号 → 导出。无需登录。
          </Typography.Text>
        </div>

        <Card
          extra={phase !== 'upload' && (
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重新开始</Button>
          )}
          styles={{ body: { padding: 24 } }}
        >
          {phase === 'upload' && (
            <Upload.Dragger {...uploadProps} key={fileInputResetKey.current}>
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined style={{ color: '#6366f1' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
              <p className="ant-upload-hint">
                支持 CSV / XLSX / XLS / TXT。文件应包含一列 DMC 码（列名可以是 "DMC" / "DMC码" / "code" 或纯无表头）。
              </p>
            </Upload.Dragger>
          )}

          {(phase === 'analyzing' || phase === 'failed') && analysis && parsed && (
            <AnalysisView parsed={parsed} analysis={analysis} onRetry={() => setPhase('upload')} />
          )}

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
              selectedTenant={null}
              saving={false}
              onExport={handleExport}
              showBackendVerify={false}
            />
          )}
        </Card>
      </div>
    </div>
  )
}
