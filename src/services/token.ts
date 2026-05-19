/**
 * Admin token 存取 —— localStorage,跟原版一致(便于 swap 实现)。
 */

const ACCESS_KEY = 'dmc.admin.access_token'
const REFRESH_KEY = 'dmc.admin.refresh_token'

export function saveTokens(t: { accessToken: string; refreshToken: string }): void {
  try {
    localStorage.setItem(ACCESS_KEY, t.accessToken)
    localStorage.setItem(REFRESH_KEY, t.refreshToken)
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* ignore */
  }
}
