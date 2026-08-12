/**
 * 工厂详情 —— ProDescriptions 展示完整 profile + admin 状态操作。
 *
 * 状态操作矩阵(按 TenantStatus 显示对应按钮):
 *   trial    → 启用订阅(active) / 停用(disabled)
 *   active   → 转试用(trial) / 停用(disabled)
 *   expired  → 启用订阅(active) / 停用(disabled)
 *   disabled → 恢复试用(trial)
 *
 * disabled 切换会同时踢出该工厂所有 active 登录会话(backend 事务保证)。
 */

import { useEffect, useState } from 'react'
import { history, useParams } from '@umijs/max'
import { ProDescriptions, ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Button,
  Card,
  message,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import type {
  AdminOrderRow,
  AdminSubscriptionRow,
  AdminSubscriptionSource,
  AdminTenantDetail,
  OrderStatus,
  PlanId,
  TenantId,
  TenantStatus,
} from '@dmc/contracts'
import { getTenantDetail, listOrders, listSubscriptions, updateTenantStatus } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import RenewTenantModalButton from '@/components/RenewTenantModalButton'

const STATUS_META: Record<TenantStatus, { text: string; color: string }> = {
  trial: { text: '试用中', color: 'blue' },
  active: { text: '订阅中', color: 'green' },
  expired: { text: '已到期', color: 'orange' },
  disabled: { text: '已停用', color: 'red' },
}

const INVITED_BY_TEXT: Record<'company' | 'referral', string> = {
  company: '公司邀请',
  referral: '推荐注册',
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<AdminTenantDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const d = await getTenantDetail(id)
      setDetail(d)
    } catch (err) {
      message.error(getErrorMessage(err, '加载详情失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleStatusChange = async (status: TenantStatus, reason?: string) => {
    if (!id) return
    setUpdating(true)
    try {
      const updated = await updateTenantStatus(id, { status, reason })
      setDetail(updated)
      message.success(`已${STATUS_META[status].text}`)
    } catch (err) {
      message.error(getErrorMessage(err, '操作失败'))
    } finally {
      setUpdating(false)
    }
  }

  if (loading && !detail) {
    return (
      <Card>
        <Skeleton active />
      </Card>
    )
  }

  if (!detail) {
    return <Card>未找到该工厂</Card>
  }

  const m = STATUS_META[detail.status]

  return (
    <Card
      title={
        <Space size="middle">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => history.back()}
          >
            返回
          </Button>
          <span style={{ fontSize: 16 }}>{detail.name}</span>
          <Tag color={m.color}>{m.text}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
          <RenewTenantModalButton
            tenantId={detail.id}
            tenantName={detail.name}
            currentExpiresAt={detail.expiresAt}
            triggerProps={{ disabled: detail.status === 'disabled' }}
            onSuccess={(updated) => setDetail(updated)}
          />
          <StatusActions
            status={detail.status}
            updating={updating}
            onChange={handleStatusChange}
          />
        </Space>
      }
    >
      <ProDescriptions<AdminTenantDetail>
        dataSource={detail}
        column={2}
        columns={[
          { title: 'ID', dataIndex: 'id', copyable: true, span: 2 },
          { title: '工厂名称', dataIndex: 'name' },
          { title: '联系人', dataIndex: 'contactName' },
          { title: '手机号', dataIndex: 'contactPhone', copyable: true },
          {
            title: '地区',
            dataIndex: 'region',
            render: (v) => (v ? (v as string) : '—'),
          },
          {
            title: '出口品类',
            dataIndex: 'exportCategory',
            render: (v) => (v ? (v as string) : '—'),
          },
          {
            title: '推荐码(自己的)',
            dataIndex: 'referralCode',
            copyable: true,
          },
          {
            title: '注册渠道',
            dataIndex: 'invitedBy',
            render: (_, row) => INVITED_BY_TEXT[row.invitedBy],
          },
          {
            title: '到期时间',
            dataIndex: 'expiresAt',
            valueType: 'dateTime',
          },
          {
            title: '首次订阅',
            dataIndex: 'firstSubscribedAt',
            valueType: 'dateTime',
            render: (v) => (v ? (v as string) : '— 未订阅(试用中)'),
          },
          { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime' },
          { title: '更新时间', dataIndex: 'updatedAt', valueType: 'dateTime' },
        ]}
      />

      {/* ─── 订阅历史子表 ─── */}
      <div style={{ marginTop: 24 }}>
        <SubscriptionHistory tenantId={detail.id} />
      </div>

      {/* ─── 支付订单子表(订单号 / 微信流水号 / 金额 / 状态)─── */}
      <div style={{ marginTop: 24 }}>
        <OrderHistory tenantId={detail.id} />
      </div>
    </Card>
  )
}

type TagMeta = { text: string; color: string }
/** 查不到就 fallback(别因为 contracts 加了新枚举值就整页崩)*/
const metaOf = (map: Record<string, TagMeta>, key: string): TagMeta => map[key] ?? { text: key, color: 'default' }

const PLAN_META: Record<PlanId, TagMeta> = {
  monthly: { text: '月度', color: 'blue' },
  yearly: { text: '年度', color: 'gold' },
  lifetime: { text: '永久', color: 'purple' },
}

const SOURCE_META: Record<AdminSubscriptionSource, TagMeta> = {
  self: { text: '自助订阅', color: 'default' },
  referred: { text: '被推荐', color: 'cyan' },
}

const ORDER_STATUS_META: Record<OrderStatus, TagMeta> = {
  pending: { text: '待支付', color: 'orange' },
  paid: { text: '已支付', color: 'green' },
  expired: { text: '已过期', color: 'default' },
  cancelled: { text: '已取消', color: 'default' },
  refunded: { text: '已退款', color: 'red' },
}

const SUB_COLUMNS: ProColumns<AdminSubscriptionRow>[] = [
  {
    title: '套餐',
    dataIndex: 'plan',
    width: 90,
    render: (_, row) => {
      const m = metaOf(PLAN_META, row.plan)
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '金额',
    dataIndex: 'priceYuan',
    width: 100,
    align: 'right',
    render: (v) => (
      <Typography.Text strong style={{ color: '#047857' }}>
        ¥ {Number(v).toFixed(2)}
      </Typography.Text>
    ),
  },
  {
    title: '来源',
    dataIndex: 'source',
    width: 100,
    render: (_, row) => {
      const m = metaOf(SOURCE_META, row.source)
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '订阅时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    width: 170,
  },
  {
    title: '到期时间',
    dataIndex: 'expiresAt',
    valueType: 'dateTime',
    width: 170,
  },
]

// 列顺序:商户单号(固定左)→ 支付单号 → 套餐 → 金额 → 状态 → 支付时间 → 创建时间(固定右)。
// 中间列超宽时横向滚动,首尾两个单号列 sticky 便于对账复制。
const ORDER_COLUMNS: ProColumns<AdminOrderRow>[] = [
  {
    title: '项目',
    dataIndex: 'projectName',
    width: 150,
    fixed: 'left',
    render: (_, row) => <Tag color="geekblue">{row.projectName}</Tag>,
  },
  {
    title: '商户单号',
    dataIndex: 'outTradeNo',
    width: 250,
    fixed: 'left',
    render: (_, row) => (
      <Typography.Text copyable style={{ fontSize: 12 }}>
        {row.outTradeNo}
      </Typography.Text>
    ),
  },
  {
    title: '支付单号',
    dataIndex: 'transactionId',
    width: 250,
    render: (_, row) =>
      row.transactionId ? (
        <Typography.Text copyable style={{ fontSize: 12 }}>
          {row.transactionId}
        </Typography.Text>
      ) : (
        '—'
      ),
  },
  {
    title: '套餐',
    dataIndex: 'plan',
    width: 80,
    render: (_, row) => {
      const m = metaOf(PLAN_META, row.plan)
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '金额',
    dataIndex: 'amountFen',
    width: 110,
    align: 'right',
    render: (_, row) => (
      <Typography.Text strong style={{ color: '#047857' }}>
        ¥ {(row.amountFen / 100).toFixed(2)}
      </Typography.Text>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 90,
    render: (_, row) => {
      const m = metaOf(ORDER_STATUS_META, row.status)
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  { title: '支付时间', dataIndex: 'paidAt', valueType: 'dateTime', width: 170 },
  { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime', width: 170, fixed: 'right' },
]

/** 工厂详情页底部:本工厂支付订单子表(商户单号 / 支付单号 / 金额 / 状态) */
function OrderHistory({ tenantId }: { tenantId: TenantId }) {
  return (
    <ProTable<AdminOrderRow>
      headerTitle="支付订单"
      columns={ORDER_COLUMNS}
      rowKey="id"
      search={false}
      // 固定左右列需要设 scroll.x(≥ 列宽合计),中间列超出即横向滚动
      scroll={{ x: 1280 }}
      pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔` }}
      options={{ density: false, fullScreen: false, reload: true, setting: false }}
      request={async (params) => {
        const resp = await listOrders({
          tenantId,
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 10,
        })
        return { data: resp.items, total: resp.total, success: true }
      }}
    />
  )
}

/** 工厂详情页底部:本工厂订阅历史子表(只读,不带搜索栏) */
function SubscriptionHistory({ tenantId }: { tenantId: TenantId }) {
  return (
    <ProTable<AdminSubscriptionRow>
      headerTitle="订阅历史"
      columns={SUB_COLUMNS}
      rowKey="id"
      search={false}
      pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔` }}
      options={{ density: false, fullScreen: false, reload: true, setting: false }}
      request={async (params) => {
        const resp = await listSubscriptions({
          tenantId,
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 10,
        })
        return { data: resp.items, total: resp.total, success: true }
      }}
    />
  )
}

function StatusActions({
  status,
  updating,
  onChange,
}: {
  status: TenantStatus
  updating: boolean
  onChange: (s: TenantStatus, reason?: string) => void
}) {
  const items: React.ReactNode[] = []

  if (status === 'trial' || status === 'expired') {
    items.push(
      <Popconfirm
        key="active"
        title="启用为正式订阅?"
        onConfirm={() => onChange('active')}
      >
        <Button type="primary" loading={updating}>
          启用订阅
        </Button>
      </Popconfirm>,
    )
  }

  if (status === 'active') {
    items.push(
      <Popconfirm
        key="trial"
        title="转为试用?"
        onConfirm={() => onChange('trial')}
      >
        <Button loading={updating}>转试用</Button>
      </Popconfirm>,
    )
  }

  if (status !== 'disabled') {
    items.push(
      <Popconfirm
        key="disable"
        title="停用该工厂?"
        description="该工厂所有 active 登录会话会被立刻踢出"
        okType="danger"
        onConfirm={() => onChange('disabled', '手动停用')}
      >
        <Button danger loading={updating}>
          停用
        </Button>
      </Popconfirm>,
    )
  }

  if (status === 'disabled') {
    items.push(
      <Popconfirm
        key="restore"
        title="恢复为试用?"
        onConfirm={() => onChange('trial')}
      >
        <Button type="primary" loading={updating}>
          恢复
        </Button>
      </Popconfirm>,
    )
  }

  return <>{items}</>
}
