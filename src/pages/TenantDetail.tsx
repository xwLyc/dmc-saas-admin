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
import { ProDescriptions } from '@ant-design/pro-components'
import {
  Button,
  Card,
  message,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
} from 'antd'
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons'
import type { AdminTenantDetail, TenantStatus } from '@dmc/contracts'
import { getTenantDetail, updateTenantStatus } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

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
            onClick={() => history.push('/tenants')}
          >
            返回列表
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
            title: '营业执照',
            dataIndex: 'licenseNo',
            render: (v) => (v ? (v as string) : '—'),
          },
          {
            title: '开票邮箱',
            dataIndex: 'invoiceEmail',
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
            title: '试用到期',
            dataIndex: 'trialEndsAt',
            valueType: 'dateTime',
            render: (v) => (v ? (v as string) : '—（subscriptions 表未落地）'),
          },
          {
            title: '订阅到期',
            dataIndex: 'subscriptionEndsAt',
            valueType: 'dateTime',
            render: (v) => (v ? (v as string) : '—（同上）'),
          },
          { title: '创建时间', dataIndex: 'createdAt', valueType: 'dateTime' },
          { title: '更新时间', dataIndex: 'updatedAt', valueType: 'dateTime' },
        ]}
      />
    </Card>
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
