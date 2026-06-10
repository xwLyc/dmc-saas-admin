/**
 * DMC 批量验证 API client —— POST codes 数组,后端 NDJSON 流推进度。
 *
 * 后端响应每行一个 event:
 *   {"type":"progress","done":K,"total":N,"ok":X,"mismatch":Y}
 *   {"type":"done","ok":N,"mismatch":M,"mismatchSamples":[{row,source,decoded}],"durationMs":D}
 *   {"type":"error","code":"...","message":"..."}
 */

import { history } from '@umijs/max'
import { getToken, clearTokens } from './token'

const ENDPOINT = '/api/admin/dmc/verify'

export interface VerifyProgress {
  done: number
  total: number
  ok: number
  mismatch: number
}

export interface VerifyMismatch {
  row: number
  source: string
  decoded: string | null
}

export interface VerifyResult {
  ok: number
  mismatch: number
  mismatchSamples: VerifyMismatch[]
  durationMs: number
}

export interface VerifyOptions {
  onProgress?: (p: VerifyProgress) => void
  signal?: AbortSignal
}

export async function verifyDmc(
  codes: string[],
  opts: VerifyOptions = {},
): Promise<VerifyResult> {
  const token = getToken()
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ codes }),
    signal: opts.signal,
  })

  if (resp.status === 401 || resp.status === 403) {
    clearTokens()
    if (location.pathname !== '/login') history.push('/login')
    throw new Error('登录已过期,请重新登录')
  }
  if (!resp.ok || !resp.body) {
    let msg = `验证失败 (HTTP ${resp.status})`
    try {
      const err = await resp.json()
      if (err?.message) msg = err.message
    } catch { /* */ }
    throw new Error(msg)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const state: {
    buffer: string
    done: VerifyResult | null
    error: { message: string } | null
  } = { buffer: '', done: null, error: null }

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line) return
    let evt: {
      type?: string; done?: number; total?: number; ok?: number; mismatch?: number
      mismatchSamples?: VerifyMismatch[]; durationMs?: number; message?: string
    }
    try { evt = JSON.parse(line) } catch { return }
    if (evt?.type === 'progress') {
      opts.onProgress?.({
        done: Number(evt.done), total: Number(evt.total),
        ok: Number(evt.ok), mismatch: Number(evt.mismatch),
      })
    } else if (evt?.type === 'done') {
      state.done = {
        ok: Number(evt.ok),
        mismatch: Number(evt.mismatch),
        mismatchSamples: evt.mismatchSamples ?? [],
        durationMs: Number(evt.durationMs),
      }
    } else if (evt?.type === 'error') {
      state.error = { message: evt.message ?? '验证失败' }
    }
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
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

  if (state.error) throw new Error(state.error.message)
  if (!state.done) throw new Error('验证失败:服务器没返回完整结果')
  return state.done
}
