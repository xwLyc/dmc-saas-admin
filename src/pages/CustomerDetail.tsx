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
  Popconfirm,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import type { CustomerBatchRow, CustomerDetailResponse } from '@dmc/contracts'
import { deleteCustomer, getCustomerDetail } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

const BATCH_STATUS_META: Record<'available' | 'used', { text: string; color: string }> = {
  available: { text: '可用', color: 'green' },
  used: { text: '已使用', color: 'default' },
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<CustomerDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)

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

  if (loading && !data) return <Card><Skeleton active /></Card>
  if (!data) return <Card><Empty description="客户不存在" /></Card>

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
      render: (_, r) => r.tenantName ?? <Typography.Text type="secondary">—</Typography.Text>,
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
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        title={
          <Space>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => history.push('/customers')}
            />
            {data.name}
            {data.shortName && <Tag>{data.shortName}</Tag>}
          </Space>
        }
        extra={
          <Space>
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
        <Space size={48} style={{ marginBottom: 16 }}>
          <Statistic title="码表张数" value={data.batchCount} suffix="张" />
          <Statistic title="累计码数" value={data.codeCount} />
        </Space>
        <ProDescriptions column={2}>
          <ProDescriptions.Item label="客户名称">{data.name}</ProDescriptions.Item>
          <ProDescriptions.Item label="内部简称">
            {data.shortName ?? '—'}
          </ProDescriptions.Item>
          <ProDescriptions.Item label="联系人">{data.contact ?? '—'}</ProDescriptions.Item>
          <ProDescriptions.Item label="联系方式">
            {data.contactInfo ?? '—'}
          </ProDescriptions.Item>
          <ProDescriptions.Item label="创建时间">
            {new Date(data.createdAt).toLocaleString('zh-CN')}
          </ProDescriptions.Item>
          <ProDescriptions.Item label="备注">{data.note ?? '—'}</ProDescriptions.Item>
        </ProDescriptions>
      </Card>

      <ProTable<CustomerBatchRow>
        headerTitle="DMC 码表档案"
        columns={columns}
        rowKey="id"
        dataSource={data.batches}
        search={false}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        options={false}
        tableExtraRender={() => (
          <Typography.Paragraph type="secondary" style={{ margin: '0 0 8px' }}>
            以下码表就是该客户的查重基准 —— 新上传的码表会跟这里全部
            {data.codeCount.toLocaleString()} 条码逐一比对，重复则拒绝入库。
          </Typography.Paragraph>
        )}
        locale={{
          emptyText: (
            <Empty description="该客户还没有码表。上传码表时选中这家客户即可建立档案" />
          ),
        }}
      />
    </Space>
  )
}
