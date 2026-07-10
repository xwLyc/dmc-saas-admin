/**
 * DMC 识别 API client —— 上传 PDF/图片到后端,流式解 NDJSON。
 *
 * 后端响应是 NDJSON 流(每行一个 JSON event):
 *   {"type":"progress","page":K,"total":N}
 *   {"type":"done","codes":[...],"pages":N,"durationMs":M}
 *   {"type":"error","code":"...","message":"..."}
 *
 * 401/403 兜底跟 app.tsx 的 errorConfig 对齐:清 token + 跳 /login。
 */

import { history } from '@umijs/max'
import { DmcRecognizeResponse } from '@dmc/contracts'
import { getToken, clearTokens } from './token'

const ENDPOINT = '/dmc-api/admin/dmc/recognize'

export interface RecognizeProgress {
  /** 已解码页数(从 1 开始) */
  page: number
  /** 总页数(PDF 总页数;图片为 1) */
  total: number
}

export interface RecognizeOptions {
  onProgress?: (p: RecognizeProgress) => void
  signal?: AbortSignal
}

export async function recognizeDmc(
  file: File,
  opts: RecognizeOptions = {},
): Promise<DmcRecognizeResponse> {
  const form = new FormData()
  form.append('file', file)

  const token = getToken()
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
    signal: opts.signal,
  })

  if (resp.status === 401 || resp.status === 403) {
    clearTokens()
    if (location.pathname !== '/login') {
      history.push('/login')
    }
    throw new Error('登录已过期,请重新登录')
  }

  // 4xx 但不是 401:可能是 400(无文件/类型不对) / 413(超限),走老 JSON 路径
  if (!resp.ok || !resp.body) {
    let msg = `识别失败 (HTTP ${resp.status})`
    try {
      const err = await resp.json()
      if (err?.message) msg = err.message
    } catch {
      // body 不是 json
    }
    throw new Error(msg)
  }

  // 流式 NDJSON 解析。state 用对象包,避免 TS 看不到闭包里的赋值而把 streamError
  // narrowing 成 never (TS bug-ish 行为,字段藏在对象里就不会)。
  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const state: {
    buffer: string
    done: DmcRecognizeResponse | null
    error: { code?: string; message: string } | null
  } = { buffer: '', done: null, error: null }

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line) return
    let evt: { type?: string; page?: number; total?: number; codes?: string[]; pages?: number; durationMs?: number; code?: string; message?: string }
    try {
      evt = JSON.parse(line)
    } catch {
      return  // 忽略坏行
    }
    if (evt?.type === 'progress') {
      opts.onProgress?.({ page: Number(evt.page), total: Number(evt.total) })
    } else if (evt?.type === 'done') {
      state.done = {
        codes: evt.codes ?? [],
        pages: Number(evt.pages),
        durationMs: Number(evt.durationMs),
      }
    } else if (evt?.type === 'error') {
      state.error = { code: evt.code, message: evt.message ?? '识别失败' }
    }
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      // flush 最后一行(应该总是以 \n 结尾,但兜底处理)
      if (state.buffer.trim()) handleLine(state.buffer)
      break
    }
    state.buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = state.buffer.indexOf('\n')) !== -1) {
      const line = state.buffer.slice(0, nl)
      state.buffer = state.buffer.slice(nl + 1)
      handleLine(line)
    }
  }

  if (state.error) {
    throw new Error(state.error.message)
  }
  if (!state.done) {
    throw new Error('识别失败:服务器没返回完整结果(连接可能中断)')
  }
  return DmcRecognizeResponse.parse(state.done)
}
