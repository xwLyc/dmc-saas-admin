/**
 * Admin API client —— 走 umi-max 内置 request(axios-style)。
 * baseURL '/dmc-api' 在 src/app.tsx 配,dev 走 umi proxy、prod 走 nginx 反代 → backend :3001。
 */

import { request } from '@umijs/max'
import type {
  AdminCreateRefundRequest,
  AdminCreateRefundResponse,
  AdminCreateTenantRequest,
  AdminDashboardStats,
  AdminDashboardStatsQuery,
  AdminListOrdersQuery,
  AdminListOrdersResponse,
  AdminListSubscriptionsQuery,
  AdminListSubscriptionsResponse,
  AdminOrderDetail,
  AdminRenewTenantRequest,
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
  CreateDmcBatchRequest,
  AdminDmcBatchRow,
  AdminListDmcBatchesQuery,
  AdminListDmcBatchesResponse,
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

/** admin 手动给工厂续期(复用 backend subscribe;写 admin audit log) */
export async function renewTenant(
  id: string,
  body: AdminRenewTenantRequest,
): Promise<AdminTenantDetail> {
  return request<AdminTenantDetail>(
    `/admin/tenants/${encodeURIComponent(id)}/renew`,
    {
      method: 'POST',
      data: body,
      skipErrorHandler: true,
    },
  )
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

// ───── dashboard ─────

export async function getDashboardStats(
  params: AdminDashboardStatsQuery = {},
): Promise<AdminDashboardStats> {
  return request<AdminDashboardStats>('/admin/dashboard/stats', {
    method: 'GET',
    params,
  })
}

// ───── subscriptions ─────

/** 订阅订单列表(分页 + plan/source/from/to/search 筛选)*/
export async function listSubscriptions(
  params: AdminListSubscriptionsQuery,
): Promise<AdminListSubscriptionsResponse> {
  return request<AdminListSubscriptionsResponse>('/admin/subscriptions', {
    method: 'GET',
    params,
  })
}

// ───── orders ─────

/** 所有订单(含 pending/expired/refunded;比 listSubscriptions 范围更广)*/
export async function listOrders(
  params: AdminListOrdersQuery,
): Promise<AdminListOrdersResponse> {
  return request<AdminListOrdersResponse>('/admin/orders', {
    method: 'GET',
    params,
  })
}

/** 订单详情(含 payments + refunds nested) */
export async function getOrderDetail(id: string): Promise<AdminOrderDetail> {
  return request<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
}

/** 发起退款(mock 模式直接 succeeded,真模式 pending 等回调) */
export async function refundOrder(
  id: string,
  body: AdminCreateRefundRequest,
): Promise<AdminCreateRefundResponse> {
  return request<AdminCreateRefundResponse>(`/admin/orders/${encodeURIComponent(id)}/refund`, {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
}

// ───── dmc-batches ─────

/** 创建码表(含全量码) */
export async function createDmcBatch(
  body: CreateDmcBatchRequest,
): Promise<AdminDmcBatchRow> {
  return request<AdminDmcBatchRow>('/admin/dmc-batches', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
}

/** 码表列表 */
export async function listDmcBatches(
  params: AdminListDmcBatchesQuery,
): Promise<AdminListDmcBatchesResponse> {
  return request<AdminListDmcBatchesResponse>('/admin/dmc-batches', {
    method: 'GET',
    params,
  })
}
