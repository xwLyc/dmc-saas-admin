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
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CustomerRow,
  CustomerDetailResponse,
  ListCustomersQuery,
  ListCustomersResponse,
  CheckDmcDuplicatesRequest,
  CheckDmcDuplicatesResponse,
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

// ───── customers(俄罗斯客户 / 买家)─────
//
// ⚠ 别跟 tenants(中国工厂)混:Customer 是给码表的俄方,Tenant 是用码表的工厂。

/** 客户列表(分页 + 名称/简称模糊搜) */
export async function listCustomers(
  params: ListCustomersQuery,
): Promise<ListCustomersResponse> {
  return request<ListCustomersResponse>('/admin/customers', {
    method: 'GET',
    params,
  })
}

/** 客户 DMC 档案:基本信息 + 历史全部码表 */
export async function getCustomerDetail(
  id: string,
): Promise<CustomerDetailResponse> {
  return request<CustomerDetailResponse>(`/admin/customers/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
}

export async function createCustomer(
  body: CreateCustomerRequest,
): Promise<CustomerRow> {
  return request<CustomerRow>('/admin/customers', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
}

export async function updateCustomer(
  id: string,
  body: UpdateCustomerRequest,
): Promise<CustomerRow> {
  return request<CustomerRow>(`/admin/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    data: body,
    skipErrorHandler: true,
  })
}

export async function deleteCustomer(id: string): Promise<void> {
  return request<void>(`/admin/customers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    skipErrorHandler: true,
  })
}

/**
 * 码表查重预检(不落库)。
 * 文件内重复 + 跟该客户历史码表的重复,分开报。
 */
export async function checkDmcDuplicates(
  body: CheckDmcDuplicatesRequest,
): Promise<CheckDmcDuplicatesResponse> {
  return request<CheckDmcDuplicatesResponse>('/admin/dmc-batches/check-duplicates', {
    method: 'POST',
    data: body,
    skipErrorHandler: true,
  })
}
