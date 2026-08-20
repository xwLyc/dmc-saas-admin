import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, InputNumber, Space, Switch, Table, Tag, message } from 'antd'
import { CalendarOutlined, CrownOutlined, FieldTimeOutlined, SaveOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { AdminPlanConfig } from '@dmc/contracts'
import { listPlans, updatePlan } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import { WorkspaceTableTitle } from '@/components/WorkspacePage'

const PLAN_ORDER = ['monthly', 'yearly', 'lifetime']

const PLAN_VISUAL: Record<string, { color: string; icon: React.ReactNode }> = {
  monthly: { color: 'blue', icon: <CalendarOutlined /> },
  yearly: { color: 'gold', icon: <FieldTimeOutlined /> },
  lifetime: { color: 'purple', icon: <CrownOutlined /> },
}

export default function PlansPage() {
  const [rows, setRows] = useState<AdminPlanConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listPlans()
      setRows(result.plans.sort((a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id)))
    } catch (error) {
      message.error(getErrorMessage(error, '加载套餐失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const changeRow = (id: string, patch: Partial<AdminPlanConfig>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const save = async (row: AdminPlanConfig) => {
    setSaving(row.id)
    try {
      const updated = await updatePlan(row.id, { amountFen: row.amountFen, enabled: row.enabled })
      changeRow(row.id, updated)
      message.success(`${row.name}已保存，新价格只影响新订单`)
    } catch (error) {
      message.error(getErrorMessage(error, '保存套餐失败'))
      void load()
    } finally {
      setSaving(null)
    }
  }

  const columns: ColumnsType<AdminPlanConfig> = [
    {
      title: '套餐',
      dataIndex: 'name',
      render: (name, row) => {
        const visual = PLAN_VISUAL[row.id] ?? PLAN_VISUAL.monthly
        return (
          <Space size={10}>
            <span className={`dmc-plan-mark is-${visual.color}`}>{visual.icon}</span>
            <span className="dmc-plan-name">
              <strong>{name}</strong>
              <small>{row.id}</small>
            </span>
          </Space>
        )
      },
    },
    {
      title: '固定时长',
      render: (_, row) =>
        row.durationDays === null ? '永久（至 2099）' : `${row.durationDays} 天`,
    },
    {
      title: '售价（元）',
      render: (_, row) => (
        <InputNumber
          className="dmc-plan-price"
          min={0.01}
          precision={2}
          step={1}
          value={row.amountFen / 100}
          addonBefore="¥"
          onChange={(value) =>
            changeRow(row.id, { amountFen: Math.round(Number(value ?? 0) * 100) })
          }
        />
      ),
    },
    {
      title: '允许新购',
      render: (_, row) => (
        <Space size={8}>
          <Switch checked={row.enabled} onChange={(enabled) => changeRow(row.id, { enabled })} />
          <Tag color={row.enabled ? 'success' : 'default'}>
            {row.enabled ? '开放购买' : '暂停新购'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '最后更新',
      dataIndex: 'updatedAt',
      render: (value) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      width: 110,
      render: (_, row) => (
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving === row.id}
          onClick={() => void save(row)}
        >
          保存
        </Button>
      ),
    },
  ]

  return (
    <div className="dmc-page-stack">
      <Card
        className="dmc-detail-card"
        title={
          <WorkspaceTableTitle
            title="套餐配置"
            description="每一行独立保存，修改不会影响历史订单"
          />
        }
      >
        <Alert
          type="info"
          showIcon
          message="价格变更只作用于新订单"
          description="已经创建的待支付订单仍按订单快照金额支付；关闭新购不会中断现有订阅。"
          style={{ marginBottom: 16 }}
        />
        <Table
          className="dmc-plan-table"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 920 }}
        />
      </Card>
    </div>
  )
}
