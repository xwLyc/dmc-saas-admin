/**
 * 往某个俄罗斯客户的 DMC 档案里上传一张码表。
 *
 * 跟「码表生成」页的区别:这里只归档到客户,不选工厂(tenantId 留空,以后再分配)。
 * 复用同一套 解析→校验→查重 逻辑,查重范围是该客户历史所有码表。
 *
 * 阶段:
 *   pick      选文件
 *   checking  解析 + 格式校验 + 跟该客户历史查重(一气呵成)
 *   invalid   格式校验没过(空/超长/含非法字符)
 *   duplicate 查重没过 → 整表拒绝
 *   confirm   干净,填码表名 + 起始序号 → 入档
 *   saving    提交中
 */

import { useState } from 'react'
import {
  Alert, Button, Input, Modal, Space, Spin, Typography, Upload, message,
} from 'antd'
import type { UploadProps } from 'antd'
import { CloudUploadOutlined } from '@ant-design/icons'
import type { CustomerId, CheckDmcDuplicatesResponse } from '@dmc/contracts'
import { parseDmcFile, type ParsedDmcFile } from '@/lib/dmc/parseFile'
import { analyzeDmcCodes } from '@/lib/dmc/validate'
import { assignSeqs } from '@/lib/dmc/sequence'
import type { AnalysisResult } from '@/lib/dmc/types'
import { checkDmcDuplicates, createDmcBatch } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import { AnalysisView } from './shared'
import { DuplicateReportView } from './DuplicateReport'

type Stage = 'pick' | 'checking' | 'invalid' | 'duplicate' | 'confirm' | 'saving'

export default function UploadBatchToCustomerModal({
  open,
  customerId,
  customerName,
  onClose,
  onUploaded,
}: {
  open: boolean
  customerId: string
  customerName: string
  onClose: () => void
  onUploaded: () => void
}) {
  const [stage, setStage] = useState<Stage>('pick')
  const [parsed, setParsed] = useState<ParsedDmcFile | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [dup, setDup] = useState<CheckDmcDuplicatesResponse | null>(null)
  const [batchName, setBatchName] = useState('')
  const [startSeq, setStartSeq] = useState('ADU000001')

  const resetAll = () => {
    setStage('pick')
    setParsed(null)
    setAnalysis(null)
    setDup(null)
    setBatchName('')
    setStartSeq('ADU000001')
  }

  const close = () => {
    resetAll()
    onClose()
  }

  const handleFile = async (file: File) => {
    try {
      setStage('checking')
      const p = await parseDmcFile(file)
      setParsed(p)
      const result = analyzeDmcCodes(p.codes.map((code) => ({ code })))
      setAnalysis(result)
      if (!result.passed) {
        setStage('invalid')
        return
      }
      setBatchName(file.name.replace(/\.(csv|txt|xlsx|xls)$/i, ''))

      // 查重:跟该客户历史所有码表比对(文件内 + 跨批次)
      const seqPreview = assignSeqs(result.uniqueCodes, startSeq)
      const d = await checkDmcDuplicates({
        customerId: customerId as CustomerId,
        codes: seqPreview.map((a) => ({ seq: a.seq, dmc: a.dmc })),
      })
      setDup(d)
      setStage(d.ok ? 'confirm' : 'duplicate')
    } catch (err) {
      message.error(getErrorMessage(err, '文件解析失败'))
      setStage('pick')
    }
  }

  const handleSave = async () => {
    if (!parsed || !analysis?.passed) return
    setStage('saving')
    const assigned = assignSeqs(analysis.uniqueCodes, startSeq)
    try {
      await createDmcBatch({
        // 只归客户,不选工厂——tenantId 留空,以后用「分配工厂」再定
        customerId: customerId as CustomerId,
        name: batchName.trim() || parsed.filename,
        filename: parsed.filename,
        startSeq: assigned[0]?.seq ?? startSeq,
        endSeq: assigned[assigned.length - 1]?.seq ?? '',
        codes: assigned.map((a) => ({ seq: a.seq, dmc: a.dmc })),
      })
      message.success(`已归入客户「${customerName}」档案`)
      onUploaded()
      close()
    } catch (err: any) {
      // 落库前后端会再查一次重(防预检和提交之间又插进同样的码)
      const detail = err?.response?.data
      if (detail?.code === 'DMC_DUPLICATE') {
        setDup(detail.details ?? null)
        setStage('duplicate')
        message.error('入档被拒绝：发现重复码')
        return
      }
      message.error(getErrorMessage(err, '入档失败'))
      setStage('confirm')
    }
  }

  const uploadProps: UploadProps = {
    accept: '.csv,.txt,.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => { void handleFile(file); return false },
  }

  return (
    <Modal
      title={`上传码表到「${customerName}」档案`}
      open={open}
      onCancel={close}
      footer={null}
      width={stage === 'duplicate' || stage === 'invalid' ? 760 : 560}
      maskClosable={false}
      destroyOnHidden
    >
      {stage === 'pick' && (
        <div>
          <Alert
            type="info"
            showIcon
            message="只归入该客户档案，暂不指定工厂"
            description="上传后会跟这家客户历史给过的所有码逐一查重；工厂以后在档案里点「分配工厂」再定。"
            style={{ marginBottom: 16 }}
          />
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined style={{ color: '#6366f1' }} />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到这里上传</p>
            <p className="ant-upload-hint">支持 CSV / XLSX / XLS / TXT，一列 DMC 码</p>
          </Upload.Dragger>
        </div>
      )}

      {stage === 'checking' && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" />
          <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
            正在校验并跟「{customerName}」历史码表查重…
          </Typography.Paragraph>
        </div>
      )}

      {stage === 'invalid' && analysis && parsed && (
        <AnalysisView parsed={parsed} analysis={analysis} onRetry={resetAll} />
      )}

      {stage === 'duplicate' && dup && (
        <DuplicateReportView result={dup} customerName={customerName} onRetry={resetAll} />
      )}

      {(stage === 'confirm' || stage === 'saving') && analysis?.passed && parsed && (
        <div>
          <Alert
            type="success"
            showIcon
            message={`校验通过，无重复：${analysis.uniqueCodes.length.toLocaleString()} 条码`}
            style={{ marginBottom: 16 }}
          />
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Typography.Text>码表名称</Typography.Text>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="档案里显示的名称"
                maxLength={100}
              />
            </div>
            <div>
              <Typography.Text>起始序号</Typography.Text>
              <Input
                value={startSeq}
                onChange={(e) => setStartSeq(e.target.value)}
                placeholder="ADU000001"
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                档案内部用于标识每条码，不影响查重（查重只看 DMC 本身）。
              </Typography.Text>
            </div>
            <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button onClick={close}>取消</Button>
              <Button type="primary" loading={stage === 'saving'} onClick={handleSave}>
                确认入档
              </Button>
            </Space>
          </Space>
        </div>
      )}
    </Modal>
  )
}
