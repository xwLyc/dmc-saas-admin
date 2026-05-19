/**
 * 后管登录页 —— ant-design-pro 的 LoginForm 模板。
 * dev 模式预填 admin/admin123(import.meta.env.DEV)
 */

import { LoginForm, ProFormText } from '@ant-design/pro-components'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { history, useModel } from '@umijs/max'
import { message } from 'antd'
import { useState } from 'react'
import { loginAdmin } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'

const isDev = (import.meta as any).env?.DEV === true

export default function LoginPage() {
  const { refresh } = useModel('@@initialState')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: { username: string; password: string }) => {
    setSubmitting(true)
    try {
      await loginAdmin({ username: values.username, password: values.password })
      message.success('登录成功')
      await refresh()
      history.push('/tenants')
    } catch (err) {
      message.error(getErrorMessage(err, '登录失败，请稍后再试'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <div style={{ width: 380 }}>
        <LoginForm
          title="DMC 后管"
          subTitle="工厂租户管理 · 单一管理员"
          initialValues={
            isDev ? { username: 'admin', password: 'admin123' } : undefined
          }
          onFinish={handleSubmit}
          submitter={{ submitButtonProps: { loading: submitting } }}
        >
          <ProFormText
            name="username"
            fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
            placeholder="管理员账号"
            rules={[{ required: true, message: '请输入账号' }]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
            placeholder="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          />
          {isDev && (
            <p
              style={{
                fontSize: 12,
                color: 'rgba(0, 0, 0, 0.45)',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              dev 默认账号：admin / admin123
            </p>
          )}
        </LoginForm>
      </div>
    </div>
  )
}
