/**
 * 管理员操作审计日志 —— ProTable 按时间倒序展示,可按 admin/target/action 筛选。
 * 接 backend GET /admin/audit-logs。
 *
 * details 字段是 JSON,各 action 形状不同:
 *   - tenant.status_change: { before, after, reason }
 *   - tenant.create:        { phone, region, exportCategory }
 * 渲染时按 action 解释展示,避免裸 JSON 不可读。
 */

import { ProTable } from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { Tag, Typography } from 'antd'
import type {
  AdminAuditLog,
  AdminListAuditLogsQuery,
  AuditAction,
  TenantStatus,
} from '@dmc/contracts'
import { listAuditLogs } from '@/services/admin'

const ACTION_META: Record<AuditAction, { text: string; color: string }> = {
  'tenant.create': { text: '新建工厂', color: 'green' },
  'tenant.status_change': { text: '改工厂状态', color: 'blue' },
}

const TENANT_STATUS_TEXT: Record<TenantStatus, string> = {
  trial: '试用中',
  active: '订阅中',
  expired: '已到期',
  disabled: '已停用',
}

function renderDetails(action: AuditAction, details: unknown) {
  if (!details || typeof details !== 'object') return <span>—</span>
  const d = details as Record<string, unknown>

  if (action === 'tenant.status_change') {
    const before = d.before as TenantStatus | undefined
    const after = d.after as TenantStatus | undefined
    const reason = d.reason as string | null | undefined
    return (
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
        <span style={{ color: '#999' }}>{before ? TENANT_STATUS_TEXT[before] : '—'}</span>
        <span style={{ margin: '0 6px' }}>→</span>
        <strong>{after ? TENANT_STATUS_TEXT[after] : '—'}</strong>
        {reason ? <div style={{ color: '#999', marginTop: 2 }}>原因: {reason}</div> : null}
      </div>
    )
  }

  if (action === 'tenant.create') {
    return (
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>
        <div>手机号: {(d.phone as string) ?? '—'}</div>
        {d.region ? <div>地区: {String(d.region)}</div> : null}
        {d.exportCategory ? <div>品类: {String(d.exportCategory)}</div> : null}
      </div>
    )
  }

  return (
    <Typography.Text code style={{ fontSize: 11 }}>
      {JSON.stringify(details)}
    </Typography.Text>
  )
}

const columns: ProColumns<AdminAuditLog>[] = [
  {
    title: '时间',
    dataIndex: 'createdAt',
    valueType: 'dateTime',
    width: 165,
    search: false,
  },
  {
    title: '操作员',
    dataIndex: 'adminUsername',
    width: 100,
    search: false,
  },
  {
    title: '操作',
    dataIndex: 'action',
    width: 110,
    valueType: 'select',
    valueEnum: {
      'tenant.create': { text: '新建工厂' },
      'tenant.status_change': { text: '改工厂状态' },
    },
    render: (_, row) => {
      const m = ACTION_META[row.action]
      return <Tag color={m?.color ?? 'default'}>{m?.text ?? row.action}</Tag>
    },
  },
  {
    title: '目标',
    dataIndex: 'targetName',
    search: false,
    render: (_, row) => (
      <Typography.Text>
        {row.targetName ?? <span style={{ color: '#999' }}>(已删除)</span>}
        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
          {row.targetType}
        </Typography.Text>
      </Typography.Text>
    ),
  },
  {
    title: '详情',
    dataIndex: 'details',
    search: false,
    render: (_, row) => renderDetails(row.action, row.details),
  },
  {
    title: 'IP',
    dataIndex: 'ipAddress',
    width: 130,
    search: false,
    render: (v) => v ?? '—',
  },
]

export default function AuditLogsPage() {
  return (
    <ProTable<AdminAuditLog, AdminListAuditLogsQuery>
      columns={columns}
      rowKey="id"
      headerTitle="操作记录"
      search={{ labelWidth: 'auto' }}
      pagination={{ pageSize: 20 }}
      request={async (params) => {
        const { current = 1, pageSize = 20, adminId, targetType, targetId, action } = params as Record<string, unknown>
        const resp = await listAuditLogs({
          page: Number(current),
          pageSize: Number(pageSize),
          adminId: adminId as string | undefined,
          targetType: targetType as 'tenant' | 'admin' | undefined,
          targetId: targetId as string | undefined,
          action: action as AuditAction | undefined,
        })
        return {
          data: resp.items,
          total: resp.total,
          success: true,
        }
      }}
    />
  )
}
