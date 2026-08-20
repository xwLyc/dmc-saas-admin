/**
 * umi-max 运行时配置:
 *   - request:base URL + JWT header 注入 + 401 → 跳登录
 *   - initialState:启动时尝试恢复登录态(读 token)
 *   - layout:ProLayout 顶栏右上角用户名 + 退出
 */

import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max'
import { history, useLocation } from '@umijs/max'
import { useContext } from 'react'
import { RouteContext } from '@ant-design/pro-components'
import { Avatar, Dropdown } from 'antd'
import {
  DownOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { getToken, clearTokens } from '@/services/token'
import { logoutAdmin } from '@/services/admin'
import './global.less'

// (静默已知 deprecated warning 的 patch 移到 .umirc.ts 的 headScripts,
//  确保比 React/antd 模块 import 更早执行)

interface InitialState {
  admin: { name: string } | null
}

const ROUTE_CONTEXT = [
  {
    test: (path: string) => path.startsWith('/tenants/'),
    eyebrow: 'TENANT PROFILE',
    title: '工厂详情',
  },
  {
    test: (path: string) => path.startsWith('/customers/'),
    eyebrow: 'DMC ARCHIVE',
    title: '客户 DMC 档案',
  },
  { test: (path: string) => path === '/dashboard', eyebrow: 'OVERVIEW', title: '数据看板' },
  { test: (path: string) => path === '/tenants', eyebrow: 'TENANT OPERATIONS', title: '工厂管理' },
  { test: (path: string) => path === '/orders', eyebrow: 'PAYMENT OPERATIONS', title: '订单管理' },
  { test: (path: string) => path === '/plans', eyebrow: 'COMMERCIAL SETTINGS', title: '套餐配置' },
  {
    test: (path: string) => path === '/customers',
    eyebrow: 'CUSTOMER ARCHIVE',
    title: '俄罗斯客户',
  },
  {
    test: (path: string) => path === '/dmc-batches',
    eyebrow: 'DMC WORKFLOW',
    title: 'DMC 序号生成',
  },
  {
    test: (path: string) => path === '/dmc-recognize',
    eyebrow: 'DMC QUALITY',
    title: 'DMC 识别对比',
  },
  {
    test: (path: string) => path === '/audit-logs',
    eyebrow: 'SECURITY & AUDIT',
    title: '操作记录',
  },
]

function ShellHeaderContext() {
  const { pathname } = useLocation()
  const current = ROUTE_CONTEXT.find((item) => item.test(pathname)) ?? {
    eyebrow: 'INTERNAL OPERATIONS',
    title: '运营控制台',
  }

  return (
    <div className="dmc-header-context">
      <span className="dmc-header-signal" aria-hidden="true" />
      <div>
        <div className="dmc-header-eyebrow">{current.eyebrow}</div>
        <div className="dmc-header-page">{current.title}</div>
      </div>
    </div>
  )
}

function ShellBrandHeader() {
  const { collapsed } = useContext(RouteContext)

  return (
    <div className={`dmc-shell-brand dmc-shell-brand-header${collapsed ? ' is-collapsed' : ''}`}>
      <img src="/dmc-admin/favicon.svg" alt="" className="dmc-shell-logo" />
      {!collapsed && (
        <div className="dmc-shell-brand-copy">
          <div className="dmc-shell-name">DMC</div>
          <div className="dmc-shell-edition">OPERATIONS</div>
        </div>
      )}
    </div>
  )
}

// ───── 启动:从 localStorage 恢复登录态 ─────
export async function getInitialState(): Promise<InitialState> {
  const token = getToken()
  if (!token) return { admin: null }
  // backend 暂无 GET /admin/me — 简化:有 token 就当登录,具体名字读不到
  // 后续 backend 加 /admin/me 后这里 fetch 真实 admin profile
  return { admin: { name: 'admin' } }
}

// ───── request 配置 ─────
export const request: RequestConfig = {
  baseURL: '/dmc-api',
  timeout: 15000,
  requestInterceptors: [
    (config: any) => {
      const token = getToken()
      if (token) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` }
      }
      return config
    },
  ],
  errorConfig: {
    errorHandler: (err: any) => {
      const status = err?.response?.status
      if (status === 401 || status === 403) {
        clearTokens()
        if (location.pathname !== '/login') {
          history.push('/login')
        }
      }
      throw err
    },
  },
}

// ───── ProLayout runtime 配置 ─────
export const layout: RunTimeLayoutConfig = ({ initialState }) => ({
  logo: '/dmc-admin/favicon.svg',
  title: false,
  fixedHeader: true,
  fixSiderbar: true,
  layout: 'mix',
  navTheme: 'light',
  siderWidth: 232,
  contentStyle: { padding: '22px 24px 32px' },
  breadcrumbRender: false,
  menu: { locale: false },
  onMenuHeaderClick: () => history.push('/dashboard'),
  menuHeaderRender: false,
  headerTitleRender: () => <ShellBrandHeader />,
  menuExtraRender: (props) =>
    props?.collapsed ? null : <div className="dmc-menu-label">运营工作台</div>,
  menuFooterRender: (props) =>
    props?.collapsed ? (
      <SafetyCertificateOutlined className="dmc-menu-footer-icon" />
    ) : (
      <div className="dmc-menu-footer">
        <SafetyCertificateOutlined />
        <div>
          <div>内部授权系统</div>
          <span>SECURE CONNECTION</span>
        </div>
      </div>
    ),
  headerContentRender: () => <ShellHeaderContext />,
  rightContentRender: (_header, dom) => {
    const admin = (initialState as InitialState | undefined)?.admin
    if (!admin) return dom
    return (
      <Dropdown
        menu={{
          items: [
            {
              key: 'logout',
              icon: <LogoutOutlined />,
              label: '退出登录',
              onClick: async () => {
                await logoutAdmin() // 调真 backend logout 吊销 session
                history.push('/login')
              },
            },
          ],
        }}
      >
        <button type="button" className="dmc-admin-trigger">
          <Avatar size={34} icon={<UserOutlined />} />
          <div className="dmc-admin-copy">
            <strong>{admin.name}</strong>
            <span>系统管理员</span>
          </div>
          <DownOutlined className="dmc-admin-chevron" />
        </button>
      </Dropdown>
    )
  },
  // 未登录访问业务页时,fetch 会返 401 → 在 request errorHandler 跳 /login,
  // 这里不再用 onPageChange guard(之前因为 window.g_initialState 不存在,
  // login 后 history.push('/tenants') 立刻被反弹回 /login)
})
