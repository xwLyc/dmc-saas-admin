/**
 * 从 umi-max / axios error 里提取真正的 backend 错误信息。
 *
 * umi-max request 基于 axios,error 结构:
 *   err.response.data      backend 响应体(我们的 ApiError shape)
 *   err.response.status    HTTP status
 *   err.message            axios 默认 message ("Request failed with status code 409")
 *
 * 兜底:axios message → fallback。
 */
export function getErrorMessage(err: unknown, fallback = '操作失败'): string {
  const e = err as {
    response?: { data?: { message?: string; code?: string } }
    data?: { message?: string }
    info?: { message?: string }
    message?: string
  }
  return (
    e?.response?.data?.message
    || e?.data?.message
    || e?.info?.message
    || e?.message
    || fallback
  )
}
