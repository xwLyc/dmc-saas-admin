/**
 * Token 存取 —— admin access + refresh token。
 * MVP 用 localStorage，未来如果分 admin / staff 多账户再加 key prefix。
 */

const ACCESS_KEY = 'dmc.admin.access_token'
const REFRESH_KEY = 'dmc.admin.refresh_token'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export function saveTokens(t: TokenPair): void {
  try {
    localStorage.setItem(ACCESS_KEY, t.accessToken)
    localStorage.setItem(REFRESH_KEY, t.refreshToken)
  } catch {
    /* localStorage 不可用,极端情况静默 */
  }
}

export function getAccessToken(): string | null {
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
    /* 同上 */
  }
}

export function hasTokens(): boolean {
  return getAccessToken() !== null
}
