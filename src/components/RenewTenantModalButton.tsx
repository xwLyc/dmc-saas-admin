/**
 * Admin 给工厂手动续期按钮 + ModalForm。
 * 复用在 TenantDetail 顶栏 + Dashboard 到期清单每行。
 *
 * 触发器样式由调用方传 button props 控制(详情页 = primary 大按钮,
 * Dashboard 清单 = small 链接式)。
 */

import { ModalForm, ProFormRadio, ProFormTextArea } from '@ant-design/pro-components'
import { Button, message } from 'antd'
import type { ButtonProps } from 'antd'
import { CalendarOutlined } from '@ant-design/icons'
import type { AdminTenantDetail, AdminRenewTenantRequest } from '@dmc/contracts'
import { renewTenant } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

interface Props {
  tenantId: string
  tenantName: string
  /** 当前到期时间 ISO,弹窗里显示参考 */
  currentExpiresAt?: string
  /** 触发器按钮 props(默认 primary + 图标);可传 size='small' 等覆盖 */
  triggerProps?: ButtonProps
  /** 触发器按钮文字(默认 "续期")*/
  triggerText?: string
  /** 续期成功后回调,父级用来刷新 UI */
  onSuccess?: (updated: AdminTenantDetail) => void
}

export default function RenewTenantModalButton({
  tenantId,
  tenantName,
  currentExpiresAt,
  triggerProps,
  triggerText = '续期',
  onSuccess,
}: Props) {
  const handleFinish = async (values: AdminRenewTenantRequest): Promise<boolean> => {
    try {
      const updated = await renewTenant(tenantId, values)
      const msg =
        values.plan === 'lifetime'
          ? `已将「${tenantName}」设为永久有效`
          : `已为「${tenantName}」续期 ${values.plan === 'yearly' ? '365' : '30'} 天`
      message.success(msg)
      onSuccess?.(updated)
      return true
    } catch (err) {
      message.error(getErrorMessage(err, '续期失败'))
      return false
    }
  }

  return (
    <ModalForm<AdminRenewTenantRequest>
      title={`为「${tenantName}」续期`}
      trigger={
        <Button type="primary" icon={<CalendarOutlined />} {...triggerProps}>
          {triggerText}
        </Button>
      }
      modalProps={{ destroyOnHidden: true, maskClosable: false }}
      width={460}
      layout="horizontal"
      labelCol={{ span: 5 }}
      wrapperCol={{ span: 17 }}
      initialValues={{ plan: 'monthly' }}
      onFinish={handleFinish}
    >
      <ProFormRadio.Group
        name="plan"
        label="套餐"
        rules={[{ required: true }]}
        options={[
          { label: '月度 (+30天) ¥19.9', value: 'monthly' },
          { label: '年度 (+365天) ¥118.8', value: 'yearly' },
          { label: '永久有效（免费授予）', value: 'lifetime' },
        ]}
      />
      <ProFormTextArea
        name="note"
        label="备注"
        placeholder="选填,如:已收微信付款 ¥19.9,流水 xxx"
        fieldProps={{
          rows: 3,
          maxLength: 500,
          showCount: true,
        }}
        tooltip="写到 admin 操作日志的 details 字段,后续可在 /audit-logs 查"
      />
      {currentExpiresAt && (
        <div style={{ fontSize: 12, color: '#999', paddingLeft: 90 }}>
          当前到期: {new Date(currentExpiresAt).toLocaleString('zh-CN')}
        </div>
      )}
    </ModalForm>
  )
}
