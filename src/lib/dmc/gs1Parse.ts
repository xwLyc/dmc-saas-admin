/**
 * GS1 DataMatrix raw → AI 段解析 —— 纯函数,可被 main 和 renderer 共用。
 *
 * 从 `src/renderer/utils/gs1Encode.ts` 抽出的纯解析部分,让 main 进程在 IPC 入口
 * (例如 `batch.repository.scanCode`)也能做严格 GS1 格式校验,跟前端打印页一致,
 * 不再用"长度 + 非纯字母"的放宽启发式让 EAN-13 / SSCC 等垃圾码混入 not_in_source 异常。
 *
 * 渲染层(bwip-js / Canvas 等)依赖仍留在 renderer 的 gs1Encode.ts,这里只放
 * **零外部依赖的纯文本解析**。
 *
 * 设计 / 边界详情见 gs1Encode.ts 的头部注释。
 */

/** GS 分隔符(0x1D) —— 标准 GS1 串里 AI 段之间用这个字符隔开 */
export const GS = String.fromCharCode(0x1d)

/** 已知 fixed-length AI 表(不全,常用够用,俄罗斯 KM 只用 01/21/91/92) */
export const FIXED_LEN: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
  '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6, '20': 2,
}

/** AI 段:raw 解析后的结构化表示,是 parens 形式的安全替代 */
export type AiSegment = { ai: string; value: string }

/**
 * 把客户原始串解析成 AiSegment[]。
 *
 * 返回 null 表示无法识别为 GS1 AI 串(应在 UI 层标红或后端走 format_invalid 异常)。
 *
 * 支持三种 raw 输入形态:
 *   A. `(01)X(21)Y(91)Z(92)W` parens 格式(少见,仅自测 / 特殊客户)
 *   B. 含 0x1D (GS) 的标准 GS1 串:`01X21Y<GS>91Z<GS>92W`
 *   C. 不含分隔符的俄罗斯 KM 启发式:`01X21Y91ZZZZ92WWW...` —— 91 后固定 4
 *      字符 + 92 后固定 44 字符(共 52 字符尾部),用长度反推位置
 */
export function rawToGs1Segments(raw: string): AiSegment[] | null {
  if (!raw) return null

  // 形态 A:已是 (NN)val(NN)val 括号格式
  if (raw.startsWith('(')) {
    return parensToSegments(raw)
  }

  // 必须以 AI 01 开头才认作 GS1
  if (!raw.startsWith('01') || raw.length < 16) return null

  // 形态 C:不含 0x1D → 俄罗斯 KM 启发式(三种后缀形态)
  if (!raw.includes(GS)) {
    if (raw.slice(16, 18) !== '21') return null

    type SuffixSpec =
      | { kind: 'long'; suffixLen: number; sigLen: number }
      | { kind: 'short'; suffixLen: number; sigLen: number }

    const CANDIDATES: SuffixSpec[] = [
      { kind: 'long',  suffixLen: 96, sigLen: 88 },  // 鞋/服装
      { kind: 'long',  suffixLen: 52, sigLen: 44 },  // 烟/轮胎/最常见
      { kind: 'short', suffixLen:  6, sigLen:  4 },  // 奶/轻量
    ]

    for (const c of CANDIDATES) {
      if (raw.length < 16 + 2 + 1 + c.suffixLen) continue

      if (c.kind === 'long') {
        const idx91 = raw.length - c.suffixLen
        const idx92 = idx91 + 6
        if (raw.slice(idx91, idx91 + 2) !== '91') continue
        if (raw.slice(idx92, idx92 + 2) !== '92') continue
        return [
          { ai: '01', value: raw.slice(2, 16) },
          { ai: '21', value: raw.slice(18, idx91) },
          { ai: '91', value: raw.slice(idx91 + 2, idx92) },
          { ai: '92', value: raw.slice(idx92 + 2) },
        ]
      } else {
        const idx93 = raw.length - c.suffixLen
        if (raw.slice(idx93, idx93 + 2) !== '93') continue
        return [
          { ai: '01', value: raw.slice(2, 16) },
          { ai: '21', value: raw.slice(18, idx93) },
          { ai: '93', value: raw.slice(idx93 + 2) },
        ]
      }
    }

    return null
  }

  // 形态 B:含 0x1D 标准 GS1 解析
  const out: AiSegment[] = []
  let i = 0
  while (i < raw.length) {
    const ai = raw.slice(i, i + 2)
    if (ai.length < 2) break
    if (!/^\d{2}$/.test(ai)) return null
    i += 2
    let value: string
    const fixed = FIXED_LEN[ai]
    if (fixed !== undefined) {
      if (raw.length < i + fixed) return null
      value = raw.slice(i, i + fixed)
      i += fixed
    } else {
      const gs = raw.indexOf(GS, i)
      if (gs === -1) {
        value = raw.slice(i)
        i = raw.length
      } else {
        value = raw.slice(i, gs)
        i = gs + 1
      }
    }
    out.push({ ai, value })
  }
  return out.length > 0 ? out : null
}

/** parens 形式 → segments(仅当 raw 以 `(` 开头时使用,假设无歧义) */
function parensToSegments(parens: string): AiSegment[] | null {
  const out: AiSegment[] = []
  let i = 0
  while (i < parens.length) {
    if (parens[i] !== '(') return null
    const close = parens.indexOf(')', i)
    if (close === -1) return null
    const ai = parens.slice(i + 1, close)
    const nextOpen = parens.indexOf('(', close + 1)
    const value = nextOpen === -1 ? parens.slice(close + 1) : parens.slice(close + 1, nextOpen)
    out.push({ ai, value })
    i = nextOpen === -1 ? parens.length : nextOpen
  }
  return out.length > 0 ? out : null
}

/** 是否含俄罗斯 KM 必备 AI 段(长码:01+21+91+92;短码:01+21+93) */
export function hasRussianKmAis(segs: AiSegment[]): boolean {
  const set = new Set(segs.map((s) => s.ai))
  if (!set.has('01') || !set.has('21')) return false
  return (set.has('91') && set.has('92')) || set.has('93')
}
