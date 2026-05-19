/**
 * Admin API 客户端 —— 调 backend /admin/* 端点。
 *
 * 直接复用 @dmc/contracts 的 Zod schema 推导出的 TS 类型,
 * 跟桌面端的"本地 type + adapter"路线不同 —— admin 是新写,从 day 1 就跟 contracts 同源。
 */

import { request } from '../lib/http'
import { saveTokens, clearTokens } from '../lib/token'
import type {
  AdminLoginRequest,
  AdminLoginResponse,
  AdminListTenantsQuery,
  AdminListTenantsResponse,
} from '@dmc/contracts'

export const adminApi = {
  async login(body: AdminLoginRequest): Promise<AdminLoginResponse> {
    const resp = await request<AdminLoginResponse>('/admin/auth/login', {
      method: 'POST',
      body,
      noAuth: true,
    })
    saveTokens({
      accessToken: resp.accessToken,
      refreshToken: resp.refreshToken,
    })
    return resp
  },

  async logout(): Promise<void> {
    // backend 暂未实现 /admin/auth/logout —— 本地清 token 即可
    clearTokens()
  },

  async listTenants(
    query: AdminListTenantsQuery = { page: 1, pageSize: 20 },
  ): Promise<AdminListTenantsResponse> {
    return request<AdminListTenantsResponse>('/admin/tenants', {
      method: 'GET',
      query: {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        status: query.status,
      },
    })
  },
}
