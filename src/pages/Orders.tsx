/**
 * 订单管理 —— ProTable 列所有订单(全状态)+ 详情 drawer + 退款 modal。
 *
 * 跟 /subscriptions 区别:
 *   /subscriptions = 已开通的(paid),用于看收入
 *   /orders        = 全状态(pending/paid/expired/cancelled/refunded),用于运营/退款
 *
 * mock 模式下退款立即 succeeded(backend createRefundByAdmin 走完整 Subscription 撤销),
 * 阶段二接真微信后退款变 pending → 等回调改 succeeded。
 */

import { useState } from 'react'
import { ModalForm, ProDescriptions, ProFormDigit, ProFormTextArea, ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import {
  Button,
  Drawer,
  Popconfirm,
  Tag,
  Typography,
  message,
} from 'antd'
import type {
  AdminOrderDetail,
  AdminOrderRow,
  OrderStatus,
  PaymentChannel,
  PlanId,
} from '@dmc/contracts'
import { getOrderDetail, listOrders, refundOrder } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

const PLAN_META: Record<PlanId, { text: string; color: string }> = {
  monthly: { text: '月度', color: 'blue' },
  yearly: { text: '年度', color: 'gold' },
}

const STATUS_META: Record<OrderStatus, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'default' },
  paid: { text: '已支付', color: 'green' },
  expired: { text: '已过期', color: 'red' },
  cancelled: { text: '已取消', color: 'orange' },
  refunded: { text: '已退款', color: 'magenta' },
}

const CHANNEL_META: Record<PaymentChannel, { text: string; color: string }> = {
  wechat: { text: '微信', color: 'green' },
  alipay: { text: '支付宝', color: 'blue' },
}

const REFUND_STATUS_META: Record<'pending' | 'succeeded' | 'failed', { text: string; color: string }> = {
  pending: { text: '处理中', color: 'default' },
  succeeded: { text: '已退款', color: 'green' },
  failed: { text: '失败', color: 'red' },
}

const yuan = (fen: number) => `¥ ${(fen / 100).toFixed(2)}`

export default function OrdersPage() {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = async (id: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const d = await getOrderDetail(id)
      setDetail(d)
    } catch (err) {
      message.error(getErrorMessage(err, '加载订单详情失败'))
    } finally {
      setDetailLoading(false)
    }
  }

  const columns: ProColumns<AdminOrderRow>[] = [
    {
      title: '订单号',
      dataIndex: 'id',
      width: 320,
      search: false,
      render: (v) => (
        <Typography.Text code style={{ whiteSpace: 'nowrap' }}>
          {v as string}
        </Typography.Text>
      ),
    },
    {
      title: '工厂',
      dataIndex: 'tenantName',
      width: 160,
      fieldProps: { placeholder: '工厂名模糊搜索' },
      render: (_, row) => <Typography.Text>{row.tenantName}</Typography.Text>,
    },
    {
      title: '套餐',
      dataIndex: 'plan',
      width: 90,
      search: false,
      render: (_, row) => <Tag color={PLAN_META[row.plan].color}>{PLAN_META[row.plan].text}</Tag>,
    },
    {
      title: '金额',
      dataIndex: 'amountFen',
      width: 100,
      search: false,
      align: 'right',
      render: (_, row) => (
        <Typography.Text strong style={{ color: '#047857' }}>
          {yuan(row.amountFen)}
        </Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        Object.entries(STATUS_META).map(([k, v]) => [k, { text: v.text }]),
      ),
      render: (_, row) => <Tag color={STATUS_META[row.status].color}>{STATUS_META[row.status].text}</Tag>,
    },
    {
      title: '渠道',
      dataIndex: 'channel',
      width: 90,
      valueType: 'select',
      valueEnum: Object.fromEntries(
        Object.entries(CHANNEL_META).map(([k, v]) => [k, { text: v.text }]),
      ),
      render: (_, row) => <Tag color={CHANNEL_META[row.channel].color}>{CHANNEL_META[row.channel].text}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      valueType: 'dateRange',
      fieldProps: { showTime: false },
      search: {
        transform: (value: [string, string] | undefined) => {
          if (!value || value.length !== 2) return {}
          return { from: value[0], to: value[1] }
        },
      },
      render: (_, row) => new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '操作',
      dataIndex: 'op',
      width: 100,
      search: false,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => openDetail(row.id)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <>
      <ProTable<AdminOrderRow>
        headerTitle="订单管理"
        columns={columns}
        rowKey="id"
        scroll={{ x: 1400 }}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔订单` }}
        search={{ labelWidth: 80, defaultCollapsed: false }}
        request={async (params) => {
          const resp = await listOrders({
            page: params.current ?? 1,
            pageSize: params.pageSize ?? 20,
            search: (params.tenantName as string | undefined) || undefined,
            status: (params.status as OrderStatus | undefined) || undefined,
            channel: (params.channel as PaymentChannel | undefined) || undefined,
            from: (params.from as string | undefined) || undefined,
            to: (params.to as string | undefined) || undefined,
          })
          return { data: resp.items, total: resp.total, success: true }
        }}
        options={{ density: true, fullScreen: true, reload: true, setting: true }}
      />

      <Drawer
        title="订单详情"
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setTimeout(() => setDetail(null), 300) }}
        width={720}
        destroyOnClose
        extra={
          detail?.status === 'paid' && (
            <RefundModalButton
              order={detail}
              onSuccess={async () => { if (detail) await openDetail(detail.id) }}
            />
          )
        }
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>加载中…</div>
        ) : detail ? (
          <>
            <ProDescriptions<AdminOrderDetail>
              dataSource={detail}
              column={2}
              columns={[
                { title: '订单号', dataIndex: 'id', span: 2, copyable: true },
                { title: '工厂', dataIndex: 'tenantName' },
                { title: '联系电话', dataIndex: 'tenantContactPhone', copyable: true },
                { title: '套餐', dataIndex: 'plan', render: (_, row) => PLAN_META[row.plan].text },
                { title: '金额', dataIndex: 'amountFen', render: (_, row) => yuan(row.amountFen) },
                { title: '状态', dataIndex: 'status', render: (_, row) => <Tag color={STATUS_META[row.status].color}>{STATUS_META[row.status].text}</Tag> },
                { title: '渠道', dataIndex: 'channel', render: (_, row) => CHANNEL_META[row.channel].text },
                { title: '微信流水号', dataIndex: 'transactionId', render: (v) => v ? <Typography.Text code>{v as string}</Typography.Text> : '—', span: 2 },
                { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime' },
                { title: '支付时间', dataIndex: 'paidAt', valueType: 'dateTime', render: (v) => v ? (v as string) : '—' },
                { title: '退款时间', dataIndex: 'refundedAt', valueType: 'dateTime', render: (v) => v ? (v as string) : '—' },
              ]}
            />

            {detail.payments.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16 }}>支付流水 ({detail.payments.length})</Typography.Title>
                {detail.payments.map((p) => (
                  <div key={p.id} style={{ padding: 12, background: '#fafafa', borderRadius: 6, marginBottom: 8 }}>
                    <div style={{ fontSize: 12 }}>
                      <Typography.Text code>{p.transactionId}</Typography.Text>
                      {' · '}{yuan(p.amountFen)}
                      {' · '}{new Date(p.receivedAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {detail.refunds.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16 }}>退款记录 ({detail.refunds.length})</Typography.Title>
                {detail.refunds.map((r) => (
                  <div key={r.id} style={{ padding: 12, background: '#fef9e7', borderRadius: 6, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      <Tag color={REFUND_STATUS_META[r.status].color}>{REFUND_STATUS_META[r.status].text}</Tag>
                      {yuan(r.amountFen)}
                      {' · '}{new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>原因: {r.reason}</div>
                    {r.failReason && <div style={{ fontSize: 11, color: '#d32f2f' }}>失败: {r.failReason}</div>}
                  </div>
                ))}
              </>
            )}
          </>
        ) : null}
      </Drawer>
    </>
  )
}

function RefundModalButton({
  order,
  onSuccess,
}: {
  order: AdminOrderDetail
  onSuccess: () => Promise<void>
}) {
  return (
    <ModalForm<{ amountFen?: number; reason: string }>
      title="发起退款"
      trigger={<Button danger>退款</Button>}
      modalProps={{ destroyOnHidden: true, maskClosable: false }}
      width={460}
      layout="horizontal"
      labelCol={{ span: 6 }}
      wrapperCol={{ span: 16 }}
      initialValues={{ amountFen: order.amountFen / 100 }}
      onFinish={async (values) => {
        try {
          await refundOrder(order.id, {
            amountFen: values.amountFen ? Math.round(values.amountFen * 100) : undefined,
            reason: values.reason,
          })
          message.success('退款已成功 (mock 模式即时完成,真模式等回调)')
          await onSuccess()
          return true
        } catch (err) {
          message.error(getErrorMessage(err, '退款失败'))
          return false
        }
      }}
    >
      <Popconfirm title={`确认退款 ¥${(order.amountFen / 100).toFixed(2)} 给 "${order.tenantName}"?`} okText="确认" cancelText="取消" disabled>
        <></>
      </Popconfirm>
      <ProFormDigit
        name="amountFen"
        label="退款金额 (元)"
        min={0.01}
        max={order.amountFen / 100}
        fieldProps={{ precision: 2 }}
        rules={[{ required: true, message: '请填退款金额' }]}
        tooltip="默认订单全额,可改为部分退款"
      />
      <ProFormTextArea
        name="reason"
        label="退款原因"
        placeholder="例:用户申请退款 / 系统重复扣款 / 客服判定"
        rules={[{ required: true, min: 1, max: 500 }]}
      />
    </ModalForm>
  )
}
