/**
 * 公司内部管理员登录页。
 *
 * 左侧建立 DMC 业务识别，右侧保持登录任务安静、直接；移动端自动收敛为单栏。
 */

import {
  ArrowRightOutlined,
  DollarCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { history, useModel } from '@umijs/max'
import { Alert, Button, Form, Input, message } from 'antd'
import { useState } from 'react'
import { loginAdmin } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import styles from './Login.module.less'

const isDev = (import.meta as any).env?.DEV === true

const MATRIX_PATTERN = [
  '101010101011',
  '110010110101',
  '101101001011',
  '111010100101',
  '100101111011',
  '110111001101',
  '101001110011',
  '111100101101',
  '100111010011',
  '110010111101',
  '101101001011',
  '111111111111',
].join('')

const CAPABILITIES = [
  { icon: <ShopOutlined />, title: '工厂租户', detail: '账号、订阅与设备状态' },
  { icon: <DollarCircleOutlined />, title: '订单运营', detail: '支付订单与套餐配置' },
  { icon: <ScanOutlined />, title: 'DMC 数据', detail: '序号生成、识别与流转' },
]

export default function LoginPage() {
  const { refresh } = useModel('@@initialState')
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleSubmit = async (values: { username: string; password: string }) => {
    setSubmitting(true)
    setLoginError(null)
    try {
      await loginAdmin({ username: values.username, password: values.password })
      message.success('登录成功')
      await refresh()
      history.push('/tenants')
    } catch (err) {
      setLoginError(getErrorMessage(err, '登录失败，请稍后再试'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="DMC 后管介绍">
        <div className={styles.brandBar}>
          <div className={styles.brandIdentity}>
            <img src="/dmc-admin/favicon.svg" alt="" className={styles.brandLogo} />
            <div>
              <div className={styles.brandName}>DMC</div>
              <div className={styles.brandEdition}>OPERATIONS</div>
            </div>
          </div>
          <span className={styles.internalBadge}>内部系统</span>
        </div>

        <div className={styles.brandContent}>
          <div className={styles.eyebrow}>数字化赋码运营平台</div>
          <h1 className={styles.brandTitle}>
            租户、订单与 DMC 资产，
            <span>统一运营。</span>
          </h1>
          <p className={styles.brandDescription}>
            面向公司运营团队的管理控制台，让工厂服务、订阅状态与 DMC 数据流转清晰可见。
          </p>

          <div className={styles.capabilityList}>
            {CAPABILITIES.map((item) => (
              <div className={styles.capabilityItem} key={item.title}>
                <span className={styles.capabilityIcon}>{item.icon}</span>
                <div>
                  <div className={styles.capabilityTitle}>{item.title}</div>
                  <div className={styles.capabilityDetail}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.matrixArtwork} aria-hidden="true">
          <div className={styles.matrixGrid}>
            {MATRIX_PATTERN.split('').map((cell, index) => (
              <span
                // 图案是静态装饰，index 在这里是稳定 key。
                key={index}
                className={`${styles.matrixCell} ${cell === '1' ? styles.matrixCellActive : ''}`}
              />
            ))}
          </div>
          <div className={styles.scanLine} />
        </div>

        <div className={styles.brandFooter}>
          <SafetyCertificateOutlined />
          <span>DMC Operations · Authorized access only</span>
        </div>
      </section>

      <section className={styles.loginPanel} aria-label="管理员登录">
        <div className={styles.loginBox}>
          <header className={styles.loginHeader}>
            <div className={styles.consoleLabel}>ADMIN CONSOLE</div>
            <h2>欢迎回来</h2>
            <p>请使用公司内部管理员账号登录</p>
          </header>

          <div className={styles.feedbackSlot} aria-live="polite">
            {loginError && (
              <Alert
                className={styles.errorAlert}
                type="error"
                showIcon
                closable
                message={loginError}
                onClose={() => setLoginError(null)}
              />
            )}
          </div>

          <Form
            className={styles.form}
            layout="vertical"
            requiredMark={false}
            initialValues={isDev ? { username: 'admin', password: 'admin123' } : undefined}
            onFinish={handleSubmit}
            onValuesChange={() => loginError && setLoginError(null)}
          >
            <Form.Item
              label="管理员账号"
              name="username"
              rules={[{ required: true, message: '请输入管理员账号' }]}
            >
              <Input
                className={styles.fieldInput}
                size="large"
                prefix={<UserOutlined />}
                placeholder="请输入管理员账号"
                autoComplete="username"
                autoFocus
              />
            </Form.Item>

            <Form.Item
              label="登录密码"
              name="password"
              rules={[{ required: true, message: '请输入登录密码' }]}
            >
              <Input.Password
                className={styles.fieldInput}
                size="large"
                prefix={<LockOutlined />}
                placeholder="请输入登录密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Button
              className={styles.submitButton}
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
            >
              {submitting ? '正在验证' : '登录控制台'}
              {!submitting && <ArrowRightOutlined />}
            </Button>

            {isDev && <div className={styles.devHint}>开发环境：admin / admin123</div>}
          </Form>

          <div className={styles.securityNote}>
            <LockOutlined />
            <span>仅限公司内部授权人员访问，操作将记录在审计日志中</span>
          </div>
        </div>

        <footer className={styles.loginFooter}>DMC 管理平台 · 安全连接</footer>
      </section>
    </main>
  )
}
