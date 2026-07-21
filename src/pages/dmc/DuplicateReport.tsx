/**
 * 查重报告 —— 码表生成页(DmcBatches)和客户档案上传(CustomerDetail)共用。
 *
 * 两类重复分开展示,处置动作不同:
 *   文件内重复   → 客户导表时就错了,让客户重新导
 *   历史重复     → 这批表是旧表的重发/部分重发,要查是不是已经印过
 */

import { Alert, Button, Table, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { CheckDmcDuplicatesResponse } from '@dmc/contracts'

export function DuplicateReportView({
  result,
  customerName,
  onRetry,
}: {
  result: CheckDmcDuplicatesResponse
  /** 有客户名就在文案里点名;Modal 场景可省 */
  customerName?: string
  /** 传了才显示「重新上传」按钮;Modal 里靠自己的关闭按钮时可省 */
  onRetry?: () => void
}) {
  return (
    <div>
      <Alert
        type="error"
        showIcon
        message="发现重复码，这批码表不能使用"
        description={
          <>
            一个 DMC 码对应俄罗斯 ЧЗ 系统里的一件商品。重复的码印出去，就是两件实物
            挂同一个身份，上报即合规事故且事后无法追溯是哪一件。
            <br />
            送检 {result.total.toLocaleString()} 条：
            文件内重复 <b>{result.fileDuplicateCount.toLocaleString()}</b> 条，
            {customerName ? `与客户「${customerName}」` : '与该客户'}历史码表重复{' '}
            <b>{result.historyDuplicateCount.toLocaleString()}</b> 条。
          </>
        }
        style={{ marginBottom: 20 }}
      />

      {result.fileDuplicateCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5}>
            文件内重复 <Tag color="red">{result.fileDuplicateCount.toLocaleString()} 条</Tag>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            同一个码在这份文件里出现了多次 —— 客户导出这份表时就错了，需要让客户重新导。
          </Typography.Paragraph>
          <Table
            size="small"
            rowKey="dmc"
            dataSource={result.fileDuplicates}
            pagination={false}
            scroll={{ y: 240 }}
            columns={[
              { title: 'DMC 码', dataIndex: 'dmc', ellipsis: true },
              {
                title: '出现在这些序号上',
                dataIndex: 'seqs',
                render: (seqs: string[]) => seqs.join('、'),
              },
            ]}
          />
        </div>
      )}

      {result.historyDuplicateCount > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5}>
            与历史码表重复{' '}
            <Tag color="red">{result.historyDuplicateCount.toLocaleString()} 条</Tag>
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            这些码该客户以前已经给过了。先确认旧码表是否已经印刷、发货，再决定要不要让客户重发。
          </Typography.Paragraph>
          <Table
            size="small"
            rowKey="dmc"
            dataSource={result.historyDuplicates}
            pagination={false}
            scroll={{ y: 300 }}
            columns={[
              { title: 'DMC 码', dataIndex: 'dmc', ellipsis: true },
              { title: '本次序号', dataIndex: 'seq', width: 110 },
              { title: '撞上的码表', dataIndex: 'existingBatchName', ellipsis: true },
              { title: '原序号', dataIndex: 'existingSeq', width: 110 },
              {
                title: '原表上传时间',
                dataIndex: 'existingCreatedAt',
                width: 170,
                render: (v: string) => new Date(v).toLocaleString('zh-CN'),
              },
            ]}
          />
        </div>
      )}

      {result.truncated && (
        <Alert
          type="info"
          showIcon
          message={`明细最多显示 ${result.fileDuplicates.length + result.historyDuplicates.length} 条，实际重复数以上方计数为准`}
          style={{ marginBottom: 16 }}
        />
      )}

      {onRetry && (
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          重新上传
        </Button>
      )}
    </div>
  )
}
