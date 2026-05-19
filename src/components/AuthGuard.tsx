/**
 * AuthGuard —— 路由守卫。
 *
 * 未登录访问业务页 → 跳 /login
 * 已登录在 /login → 跳 /tenants
 * isHydrating 期间显示 splash,避免闪烁
 */

import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useAuthStore } from '../store/auth.store'

const PUBLIC_PATHS = ['/login']

export default function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isHydrating } = useAuth()

  useEffect(() => {
    if (isHydrating) return
    const path = location.pathname
    const isPublic = PUBLIC_PATHS.includes(path)

    if (!isAuthenticated && !isPublic) {
      navigate('/login', { replace: true })
    } else if (isAuthenticated && isPublic) {
      navigate('/tenants', { replace: true })
    }
  }, [isHydrating, isAuthenticated, location.pathname, navigate])

  if (isHydrating) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        正在加载…
      </div>
    )
  }

  return <>{children}</>
}

/** 启动时调一次 hydrate */
export function useAuthHydration() {
  const hydrate = useAuthStore((s) => s.hydrate)
  useEffect(() => {
    hydrate()
  }, [hydrate])
}
