/**
 * umi-max 运行时配置:
 *   - request:base URL + JWT header 注入 + 401 → 跳登录
 *   - initialState:启动时尝试恢复登录态(读 token)
 *   - layout:ProLayout 顶栏右上角用户名 + 退出
 */

import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max'
import { history } from '@umijs/max'
import { Button, Dropdown } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { getToken, clearTokens } from '@/services/token'
import { logoutAdmin } from '@/services/admin'

// (静默已知 deprecated warning 的 patch 移到 .umirc.ts 的 headScripts,
//  确保比 React/antd 模块 import 更早执行)

interface InitialState {
  admin: { name: string } | null
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
  logo: false,
  title: 'DMC 后管',
  fixedHeader: true,
  fixSiderbar: true,
  layout: 'mix',
  contentStyle: { padding: 16 },
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
        <Button type="text" size="small">
          {admin.name}
        </Button>
      </Dropdown>
    )
  },
  // 未登录访问业务页时,fetch 会返 401 → 在 request errorHandler 跳 /login,
  // 这里不再用 onPageChange guard(之前因为 window.g_initialState 不存在,
  // login 后 history.push('/tenants') 立刻被反弹回 /login)
})
