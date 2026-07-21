/**
 * 给客户档案里「未分配工厂」的码表分配工厂。
 *
 * 客户档案上传的码表只归客户、不带工厂,桌面端拉不到。分配后该工厂就能拉取。
 * 只改归属,不动码(码上传时已校验+查重)。
 */

import { useEffect, useState } from 'react'
import { Button, Modal, Select, message } from 'antd'
import type { AdminTenantRow, TenantId } from '@dmc/contracts'
import { assignBatchTenant, listTenants } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

export default function AssignTenantButton({
  batchId,
  onAssigned,
}: {
  batchId: string
  onAssigned: () => void
}) {
  const [open, setOpen] = useState(false)
  const [tenants, setTenants] = useState<AdminTenantRow[]>([])
  const [tenantId, setTenantId] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    listTenants({ page: 1, pageSize: 100 })
      .then((r) => setTenants(r.items))
      .catch(() => {})
  }, [open])

  const submit = async () => {
    if (!tenantId) {
      message.warning('请选择工厂')
      return
    }
    setSaving(true)
    try {
      await assignBatchTenant(batchId, { tenantId: tenantId as TenantId })
      message.success('已分配工厂')
      setOpen(false)
      setTenantId(undefined)
      onAssigned()
    } catch (err) {
      message.error(getErrorMessage(err, '分配失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <a onClick={() => setOpen(true)}>分配工厂</a>
      <Modal
        title="分配工厂"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText="分配"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Select
          style={{ width: '100%' }}
          showSearch
          placeholder="选择工厂"
          optionFilterProp="label"
          value={tenantId}
          onChange={setTenantId}
          options={tenants.map((t) => ({
            value: t.id,
            label: `${t.name}（${t.contactPhone}）`,
          }))}
        />
      </Modal>
    </>
  )
}
