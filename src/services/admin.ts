/**
 * Admin API client —— 走 umi-max 内置 request(axios-style)。
 * baseURL '/api' 在 src/app.tsx 配,dev 时 vite proxy → backend :3001。
 */

import { request } from '@umijs/max'
import type {
  AdminCreateTenantRequest,
  AdminListAuditLogsQuery,
  AdminListAuditLogsResponse,
  AdminListTenantsQuery,
  AdminListTenantsResponse,
  AdminLoginRequest,
  AdminLoginResponse,
  AdminRefreshResponse,
  AdminTenantDetail,
  AdminTenantRow,
  AdminUpdateTenantStatusRequest,
} from '@dmc/contracts'
import { clearTokens, getRefreshToken, saveTokens } from './token'

// ───── auth ─────

export async function loginAdmin(
  body: AdminLoginRequest,
): Promise<AdminLoginResponse> {
  const resp = await request<AdminLoginResponse>('/admin/auth/login', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
  saveTokens({ accessToken: resp.accessToken, refreshToken: resp.refreshToken })
  return resp
}

/** refresh token rotation — 当前未自动调用,留作未来用 */
export async function refreshAdminToken(): Promise<AdminRefreshResponse> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('no refresh token')
  const resp = await request<AdminRefreshResponse>('/admin/auth/refresh', {
    method: 'POST',
    data: { refreshToken },
    skipErrorHandler: true,
  })
  saveTokens({ accessToken: resp.accessToken, refreshToken: resp.refreshToken })
  return resp
}

export async function logoutAdmin(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (refreshToken) {
    try {
      await request<void>('/admin/auth/logout', {
        method: 'POST',
        data: { refreshToken },
        skipErrorHandler: true,
      })
    } catch {
      // 即使云端调用失败,本地也清(网络不通时让用户能退出)
    }
  }
  clearTokens()
}

// ───── tenants ─────

export async function listTenants(
  params: AdminListTenantsQuery,
): Promise<AdminListTenantsResponse> {
  return request<AdminListTenantsResponse>('/admin/tenants', {
    method: 'GET',
    params,
  })
}

export async function getTenantDetail(id: string): Promise<AdminTenantDetail> {
  return request<AdminTenantDetail>(`/admin/tenants/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
}

export async function updateTenantStatus(
  id: string,
  body: AdminUpdateTenantStatusRequest,
): Promise<AdminTenantDetail> {
  return request<AdminTenantDetail>(
    `/admin/tenants/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      data: body,
      skipErrorHandler: true,
    },
  )
}

export async function createTenant(
  body: AdminCreateTenantRequest,
): Promise<AdminTenantRow> {
  return request<AdminTenantRow>('/admin/tenants', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
}

// ───── audit logs ─────

export async function listAuditLogs(
  params: AdminListAuditLogsQuery,
): Promise<AdminListAuditLogsResponse> {
  return request<AdminListAuditLogsResponse>('/admin/audit-logs', {
    method: 'GET',
    params,
  })
}
