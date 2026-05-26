/**
 * 订阅订单列表 —— ProTable 接 GET /admin/subscriptions。
 *
 * KPI / 月趋势走 Dashboard,这页只展示"每一笔订单"明细;支持按 plan/source/时间/租户名 筛选。
 * source 派生:tenant.referredByTenantId 是否为空 → 'self' (自助) / 'referred' (被推荐)。
 */

import { history } from '@umijs/max'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { Tag, Typography } from 'antd'
import type {
  AdminSubscriptionRow,
  AdminSubscriptionSource,
  PlanId,
} from '@dmc/contracts'
import { listSubscriptions } from '@/services/admin'

const PLAN_META: Record<PlanId, { text: string; color: string }> = {
  monthly: { text: '月度', color: 'blue' },
  yearly: { text: '年度', color: 'gold' },
}

const SOURCE_META: Record<AdminSubscriptionSource, { text: string; color: string }> = {
  self: { text: '自助订阅', color: 'default' },
  referred: { text: '被推荐', color: 'cyan' },
}

const columns: ProColumns<AdminSubscriptionRow>[] = [
  {
    title: '订单号',
    dataIndex: 'id',
    width: 320,
    search: false,
    render: (v) => (
      <Typography.Text
        code
        copyable={{ tooltips: false }}
        style={{ whiteSpace: 'nowrap' }}
      >
        {v as string}
      </Typography.Text>
    ),
  },
  {
    title: '工厂',
    dataIndex: 'tenantName',
    fixed: 'left',
    width: 180,
    fieldProps: { placeholder: '工厂名模糊搜索' },
    render: (_, row) => (
      // Typography.Link 自带 antd 链接色 + hover 高亮(primary blue);
      // href 让右键复制能用,onClick preventDefault 走 SPA 路由不刷新整页
      <Typography.Link
        href={`/tenants/${row.tenantId}`}
        onClick={(e) => {
          e.preventDefault()
          history.push(`/tenants/${row.tenantId}`)
        }}
      >
        {row.tenantName}
      </Typography.Link>
    ),
  },
  {
    title: '套餐',
    dataIndex: 'plan',
    width: 100,
    valueType: 'select',
    valueEnum: Object.fromEntries(
      Object.entries(PLAN_META).map(([k, v]) => [k, { text: v.text }]),
    ),
    render: (_, row) => {
      const m = PLAN_META[row.plan]
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '金额',
    dataIndex: 'priceYuan',
    width: 100,
    search: false,
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
    width: 110,
    valueType: 'select',
    valueEnum: Object.fromEntries(
      Object.entries(SOURCE_META).map(([k, v]) => [k, { text: v.text }]),
    ),
    render: (_, row) => {
      const m = SOURCE_META[row.source]
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '订阅时间',
    dataIndex: 'createdAt',
    width: 170,
    valueType: 'dateRange',
    fieldProps: { showTime: false },
    // ProTable dateRange 默认值是 [from, to];backend 拿 from/to 单字段,在 transform 里映射
    search: {
      transform: (value: [string, string] | undefined) => {
        if (!value || value.length !== 2) return {}
        return { from: value[0], to: value[1] }
      },
    },
    render: (_, row) => new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }),
  },
  {
    title: '到期时间',
    dataIndex: 'expiresAt',
    width: 170,
    valueType: 'dateTime',
    search: false,
  },
]

export default function SubscriptionsPage() {
  return (
    // .subs-page 范围内的复制按钮默认隐藏,行 hover 时才显示;
    // antd copyable 渲染的元素 class 是 .ant-typography-copy
    <div className="subs-page">
      <style>{`
        .subs-page .ant-typography-copy { opacity: 0; transition: opacity 0.15s; }
        .subs-page .ant-table-row:hover .ant-typography-copy { opacity: 1; }
      `}</style>
      <ProTable<AdminSubscriptionRow>
        headerTitle="订阅订单"
        columns={columns}
        rowKey="id"
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔订单` }}
        search={{ labelWidth: 80, defaultCollapsed: false }}
        request={async (params) => {
          const resp = await listSubscriptions({
            page: params.current ?? 1,
            pageSize: params.pageSize ?? 20,
            search: (params.tenantName as string | undefined) || undefined,
            plan: (params.plan as PlanId | undefined) || undefined,
            source: (params.source as AdminSubscriptionSource | undefined) || undefined,
            from: (params.from as string | undefined) || undefined,
            to: (params.to as string | undefined) || undefined,
          })
          return { data: resp.items, total: resp.total, success: true }
        }}
        options={{ density: true, fullScreen: true, reload: true, setting: true }}
      />
    </div>
  )
}
