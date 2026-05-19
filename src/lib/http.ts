/**
 * HTTP 客户端 —— 后管 fetch 封装。
 *
 * 比桌面端简化:
 *   - 没有 mock 切换(后管开发期就接真 backend)
 *   - 没有 401 自动 refresh(admin token 过期就跳登录页,简单粗暴)
 *   - 统一错误转 ApiError 形状 { code, message, status }
 */

import { getAccessToken } from './token'

const API_BASE: string =
  (import.meta as any).env?.VITE_SAAS_API_BASE || '/api'

export interface ApiError {
  code: string
  message: string
  status: number
}

export class ApiErrorObj extends Error implements ApiError {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isApiError(err: unknown): err is ApiErrorObj {
  return (
    err instanceof Error
    && typeof (err as ApiErrorObj).code === 'string'
    && typeof (err as ApiErrorObj).status === 'number'
  )
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  noAuth?: boolean
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'POST', body, query, noAuth = false } = options

  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') {
        url.searchParams.set(k, String(v))
      }
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (!noAuth) {
    const token = getAccessToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new ApiErrorObj(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : '网络错误',
      0,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  let data: any = null
  try {
    data = await response.json()
  } catch {
    /* 空 body */
  }

  if (!response.ok) {
    throw new ApiErrorObj(
      data?.code ?? 'UNKNOWN_ERROR',
      data?.message ?? `请求失败 (HTTP ${response.status})`,
      response.status,
    )
  }

  return data as T
}
