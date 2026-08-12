import { useCallback, useEffect, useState } from 'react'
import { Button, Card, InputNumber, Space, Switch, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { AdminPlanConfig } from '@dmc/contracts'
import { listPlans, updatePlan } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

const PLAN_ORDER = ['monthly', 'yearly', 'lifetime']

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

  useEffect(() => { void load() }, [load])

  const changeRow = (id: string, patch: Partial<AdminPlanConfig>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))
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
    { title: '套餐', dataIndex: 'name', render: (name, row) => <Space>{name}<Tag>{row.id}</Tag></Space> },
    {
      title: '固定时长',
      render: (_, row) => row.durationDays === null ? '永久（至 2099）' : `${row.durationDays} 天`,
    },
    {
      title: '售价（元）',
      render: (_, row) => (
        <InputNumber
          min={0.01}
          precision={2}
          step={1}
          value={row.amountFen / 100}
          addonBefore="¥"
          onChange={(value) => changeRow(row.id, { amountFen: Math.round(Number(value ?? 0) * 100) })}
        />
      ),
    },
    {
      title: '允许新购',
      render: (_, row) => (
        <Switch
          checked={row.enabled}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(enabled) => changeRow(row.id, { enabled })}
        />
      ),
    },
    { title: '最后更新', dataIndex: 'updatedAt', render: (value) => new Date(value).toLocaleString('zh-CN') },
    {
      title: '操作',
      render: (_, row) => <Button type="primary" loading={saving === row.id} onClick={() => void save(row)}>保存</Button>,
    },
  ]

  return (
    <Card title="套餐配置">
      <Typography.Paragraph type="secondary">
        套餐类型和时长固定，只能调整售价与是否允许新购。已创建的待支付订单继续按订单快照金额支付。
      </Typography.Paragraph>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={false} />
    </Card>
  )
}
