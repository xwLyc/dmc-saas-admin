/**
 * 客户 DMC 档案 —— 基本信息 + 该俄罗斯客户历史上给过的全部码表。
 *
 * 这页是查重的「范围」可视化:上传新码表时系统拿这里列出的所有码去比对。
 * 所以码表列表不只是流水,它就是查重基准。
 */

import { useCallback, useEffect, useState } from 'react'
import { history, useParams } from '@umijs/max'
import { ProDescriptions, ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { CustomerBatchRow, CustomerDetailResponse, DmcBatchStatus } from '@dmc/contracts'
import {
  deleteCustomer,
  deleteDmcBatch,
  getCustomerDetail,
  invalidateDmcBatch,
  releaseDmcBatch,
} from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import UploadBatchToCustomerModal from './dmc/UploadBatchToCustomerModal'
import AssignTenantButton from './dmc/AssignTenantButton'
import { WorkspaceTableTitle } from '@/components/WorkspacePage'

const BATCH_STATUS_META: Record<DmcBatchStatus, { text: string; color: string }> = {
  available: { text: '可用', color: 'green' },
  claimed: { text: '已领取', color: 'blue' },
  used: { text: '生产中', color: 'gold' },
  invalidated: { text: '已作废', color: 'default' },
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      setData(await getCustomerDetail(id))
    } catch (err) {
      message.error(getErrorMessage(err, '加载客户档案失败'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data)
    return (
      <Card>
        <Skeleton active />
      </Card>
    )
  if (!data)
    return (
      <Card>
        <Empty description="客户不存在" />
      </Card>
    )

  const columns: ProColumns<CustomerBatchRow>[] = [
    { title: '码表名称', dataIndex: 'name', ellipsis: true },
    { title: '文件名', dataIndex: 'filename', ellipsis: true },
    {
      title: '序号范围',
      width: 200,
      render: (_, r) => `${r.startSeq} — ${r.endSeq}`,
    },
    {
      title: '码数',
      dataIndex: 'total',
      width: 100,
      render: (_, r) => r.total.toLocaleString(),
    },
    {
      title: '发给工厂',
      dataIndex: 'tenantName',
      ellipsis: true,
      render: (_, r) =>
        r.tenantName ?? (
          <Tag color="orange" style={{ margin: 0 }}>
            未分配
          </Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (_, r) => {
        const m = BATCH_STATUS_META[r.status]
        return <Tag color={m.color}>{m.text}</Tag>
      },
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (_, r) => new Date(r.createdAt).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 180,
      render: (_, r) => (
        <Space size="middle">
          {/* 只有还没分配工厂的码表能分配;已分配的不显示(改派是另一回事,先不做) */}
          {!r.tenantId && r.status === 'available' && (
            <AssignTenantButton batchId={r.id} onAssigned={() => void load()} />
          )}
          {r.status === 'available' && (
            <Popconfirm
              title="删除这张从未领取的码表？"
              description={`将删除「${r.name}」的全部 ${r.total.toLocaleString()} 条码，不可恢复。`}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={async () => {
                try {
                  await deleteDmcBatch(r.id)
                  message.success('已删除')
                  void load()
                } catch (err) {
                  message.error(getErrorMessage(err, '删除失败'))
                }
              }}
            >
              <a style={{ color: '#cf1322' }}>删除</a>
            </Popconfirm>
          )}
          {r.status === 'claimed' && (
            <Popconfirm
              title="释放该码表？"
              description="仅适用于工厂确认尚未扫码生产的情况。释放后可被重新领取。"
              onConfirm={async () => {
                try {
                  await releaseDmcBatch(r.id)
                  message.success('已释放')
                  void load()
                } catch (err) {
                  message.error(getErrorMessage(err, '释放失败'))
                }
              }}
            >
              <a>释放</a>
            </Popconfirm>
          )}
          {r.status === 'used' && (
            <a
              style={{ color: '#cf1322' }}
              onClick={() => {
                let reason = ''
                Modal.confirm({
                  title: '作废生产中的码表',
                  content: (
                    <Input.TextArea
                      autoFocus
                      rows={3}
                      placeholder="请输入作废原因（必填，会写入操作记录）"
                      onChange={(event) => {
                        reason = event.target.value
                      }}
                    />
                  ),
                  okText: '确认作废',
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    if (!reason.trim()) {
                      message.error('请输入作废原因')
                      throw new Error('reason required')
                    }
                    try {
                      await invalidateDmcBatch(r.id, { reason: reason.trim() })
                      message.success('已作废，生产历史仍保留')
                      void load()
                    } catch (err) {
                      message.error(getErrorMessage(err, '作废失败'))
                      throw err
                    }
                  },
                })
              }}
            >
              作废
            </a>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="dmc-page-stack">
      <Card
        className="dmc-detail-card"
        title={
          <div className="dmc-detail-card-title">
            <Button
              type="text"
              className="dmc-card-back"
              icon={<ArrowLeftOutlined />}
              aria-label="返回客户列表"
              onClick={() => history.push('/customers')}
            />
            <WorkspaceTableTitle
              title={data.name}
              description="全部历史码表共同组成该客户的跨批次查重基准"
              badge={data.shortName ? <Tag>{data.shortName}</Tag> : undefined}
            />
          </div>
        }
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>
              刷新
            </Button>
            <Popconfirm
              title="删除该客户？"
              description={
                data.batchCount > 0
                  ? `该客户名下有 ${data.batchCount} 张码表，删除会被拒绝`
                  : '该客户名下没有码表，可以安全删除'
              }
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                try {
                  await deleteCustomer(data.id)
                  message.success('已删除')
                  history.push('/customers')
                } catch (err) {
                  message.error(getErrorMessage(err, '删除失败'))
                }
              }}
            >
              <Button danger>删除</Button>
            </Popconfirm>
          </Space>
        }
      >
        <div className="dmc-metric-strip">
          <Statistic title="码表张数" value={data.batchCount} suffix="张" />
          <Statistic title="累计码数" value={data.codeCount} />
        </div>
        <ProDescriptions bordered size="small" column={{ xs: 1, sm: 1, md: 2, xl: 2 }}>
          <ProDescriptions.Item label="客户名称">{data.name}</ProDescriptions.Item>
          <ProDescriptions.Item label="内部简称">{data.shortName ?? '—'}</ProDescriptions.Item>
          <ProDescriptions.Item label="联系人">{data.contact ?? '—'}</ProDescriptions.Item>
          <ProDescriptions.Item label="联系方式">{data.contactInfo ?? '—'}</ProDescriptions.Item>
          <ProDescriptions.Item label="创建时间">
            {new Date(data.createdAt).toLocaleString('zh-CN')}
          </ProDescriptions.Item>
          <ProDescriptions.Item label="备注">{data.note ?? '—'}</ProDescriptions.Item>
        </ProDescriptions>
      </Card>

      <ProTable<CustomerBatchRow>
        headerTitle={
          <WorkspaceTableTitle title="DMC 码表档案" description="历史码表、分配对象与生产状态" />
        }
        columns={columns}
        rowKey="id"
        dataSource={data.batches}
        search={false}
        // 定 min-width,窄屏横向滚动、宽屏由无宽度的「码表名称/文件名」列撑满
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        options={false}
        toolBarRender={() => [
          <Button
            key="upload"
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => setUploadOpen(true)}
          >
            上传码表
          </Button>,
        ]}
        tableExtraRender={() => (
          <Typography.Paragraph className="dmc-inline-note">
            以下码表就是该客户的查重基准 —— 新上传的码表会跟这里全部
            {data.codeCount.toLocaleString()} 条码逐一比对，重复则拒绝入库。
          </Typography.Paragraph>
        )}
        locale={{
          emptyText: <Empty description="该客户还没有码表。点右上角「上传码表」建立档案" />,
        }}
      />

      <UploadBatchToCustomerModal
        open={uploadOpen}
        customerId={data.id}
        customerName={data.name}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => void load()}
      />
    </div>
  )
}
