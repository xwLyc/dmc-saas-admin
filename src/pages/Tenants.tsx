/**
 * 工厂列表 —— ProTable + 新建 Modal + 行点击跳详情。
 * 接 backend GET /admin/tenants。新建走 POST /admin/tenants。
 */

import { Link } from '@umijs/max'
import {
  ModalForm,
  ProFormText,
  ProTable,
} from '@ant-design/pro-components'
import type { ProColumns } from '@ant-design/pro-components'
import { Button, message, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type {
  AdminCreateTenantRequest,
  AdminTenantRow,
  TenantStatus,
} from '@dmc/contracts'
import { createTenant, listTenants } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

const STATUS_META: Record<TenantStatus, { text: string; color: string }> = {
  trial: { text: '试用中', color: 'blue' },
  active: { text: '订阅中', color: 'green' },
  expired: { text: '已到期', color: 'orange' },
  disabled: { text: '已停用', color: 'red' },
}

const INVITED_BY_META: Record<
  'company' | 'referral',
  { text: string; color: string }
> = {
  company: { text: '公司邀请', color: 'default' },
  referral: { text: '推荐注册', color: 'cyan' },
}

function CreateTenantModal({ onSuccess }: { onSuccess: () => void }) {
  return (
    <ModalForm<AdminCreateTenantRequest>
      title="新增工厂"
      trigger={
        <Button type="primary" icon={<PlusOutlined />}>
          新增工厂
        </Button>
      }
      modalProps={{ destroyOnHidden: true, maskClosable: false }}
      width={520}
      layout="horizontal"
      labelCol={{ span: 6 }}
      wrapperCol={{ span: 16 }}
      onFinish={async (values) => {
        try {
          await createTenant(values)
          message.success('创建成功,初始密码已设;工厂可用"忘记密码"自助改')
          onSuccess()
          return true
        } catch (err) {
          message.error(getErrorMessage(err, '创建失败'))
          return false
        }
      }}
    >
      <ProFormText
        name="phone"
        label="手机号"
        placeholder="11 位手机号"
        rules={[
          { required: true, message: '请输入手机号' },
          { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误' },
        ]}
      />
      <ProFormText.Password
        name="password"
        label="初始密码"
        placeholder="≥ 6 位"
        rules={[
          { required: true, message: '请输入初始密码' },
          { min: 6, message: '至少 6 位' },
          { max: 64, message: '最多 64 位' },
        ]}
      />
      <ProFormText
        name="factoryName"
        label="工厂名称"
        placeholder="例:鼎丰食品有限公司"
        rules={[
          { required: true, message: '请输入工厂名称' },
          { min: 2, max: 50 },
        ]}
      />
      <ProFormText
        name="contactName"
        label="联系人"
        placeholder="选填,默认用工厂名"
        rules={[{ max: 20 }]}
      />
      <ProFormText name="region" label="地区" placeholder="选填,例:广东深圳" />
      <ProFormText
        name="exportCategory"
        label="出口品类"
        placeholder="选填,例:罐头/酒水"
      />
    </ModalForm>
  )
}

const columns: ProColumns<AdminTenantRow>[] = [
  {
    title: '工厂名',
    dataIndex: 'name',
    fixed: 'left',
    width: 180,
    render: (_, row) => (
      <Link to={`/tenants/${row.id}`}>
        <Typography.Text strong>{row.name}</Typography.Text>
      </Link>
    ),
  },
  { title: '联系人', dataIndex: 'contactName', width: 100, search: false },
  {
    title: '手机号',
    dataIndex: 'contactPhone',
    width: 140,
    render: (v) => <Typography.Text code>{v as string}</Typography.Text>,
  },
  {
    title: '地区',
    dataIndex: 'region',
    width: 100,
    search: false,
    render: (v) => v || '—',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    valueType: 'select',
    valueEnum: Object.fromEntries(
      Object.entries(STATUS_META).map(([k, v]) => [
        k,
        { text: v.text, status: v.color },
      ]),
    ),
    render: (_, row) => {
      const m = STATUS_META[row.status]
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '渠道',
    dataIndex: 'invitedBy',
    width: 90,
    search: false,
    render: (_, row) => {
      const m = INVITED_BY_META[row.invitedBy]
      return <Tag color={m.color}>{m.text}</Tag>
    },
  },
  {
    title: '推荐码',
    dataIndex: 'referralCode',
    width: 120,
    search: false,
    render: (v) => <Typography.Text code>{v as string}</Typography.Text>,
  },
  {
    title: '注册时间',
    dataIndex: 'createdAt',
    width: 160,
    valueType: 'dateTime',
    search: false,
  },
]

export default function TenantsPage() {
  return (
    <ProTable<AdminTenantRow>
      headerTitle="工厂管理"
      columns={columns}
      rowKey="id"
      scroll={{ x: 1100 }}
      pagination={{ pageSize: 20, showSizeChanger: false }}
      search={{ labelWidth: 80, defaultCollapsed: false }}
      // 用 toolBarRender 的 action 参数(ProTable 注入)而非 actionRef,
      // 避免 modal 关闭瞬间 ref 还没 attach 的时序 bug
      toolBarRender={(action) => [
        <CreateTenantModal
          key="create"
          onSuccess={() => action?.reloadAndRest?.()}
        />,
      ]}
      request={async (params) => {
        const resp = await listTenants({
          page: params.current ?? 1,
          pageSize: params.pageSize ?? 20,
          search: (params.name as string | undefined) || undefined,
          status: (params.status as TenantStatus | undefined) || undefined,
        })
        return { data: resp.items, total: resp.total, success: true }
      }}
      options={{
        density: true,
        fullScreen: true,
        reload: true,
        setting: true,
      }}
    />
  )
}
