/**
 * Auth store —— 当前登录的 admin 信息 + hydrate 状态。
 *
 * 比桌面端简化:admin 没有 GET /admin/me 端点,
 * hydrate 时把 admin info 从 localStorage 缓存恢复(login 时一起存)。
 * token 失效 → 调 backend 任意端点会返 401 → 上层抓住后 logout。
 */

import { create } from 'zustand'
import { hasTokens, clearTokens } from '../lib/token'
import type { AdminUser } from '@dmc/contracts'

const ADMIN_CACHE_KEY = 'dmc.admin.cached_user'

interface AuthStore {
  isHydrating: boolean
  admin: AdminUser | null

  hydrate: () => void
  setAuth: (admin: AdminUser) => void
  logout: () => void
}

function loadCachedAdmin(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_CACHE_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

function saveCachedAdmin(admin: AdminUser | null): void {
  try {
    if (admin) {
      localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(admin))
    } else {
      localStorage.removeItem(ADMIN_CACHE_KEY)
    }
  } catch {
    /* ignore */
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  isHydrating: true,
  admin: null,

  hydrate: () => {
    if (!hasTokens()) {
      set({ isHydrating: false, admin: null })
      return
    }
    const cached = loadCachedAdmin()
    set({ isHydrating: false, admin: cached })
  },

  setAuth: (admin) => {
    saveCachedAdmin(admin)
    set({ admin, isHydrating: false })
  },

  logout: () => {
    clearTokens()
    saveCachedAdmin(null)
    set({ admin: null })
  },
}))

export function useAuth() {
  const admin = useAuthStore((s) => s.admin)
  const isHydrating = useAuthStore((s) => s.isHydrating)
  return {
    admin,
    isHydrating,
    isAuthenticated: admin !== null,
  }
}
