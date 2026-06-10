/**
 * GS1 DataMatrix 编码助手 —— 专为俄罗斯 Честный ЗНАК KM 设计。
 *
 * v0.7.32+:**纯解析部分已下沉到 `src/shared/gs1Parse.ts`** —— 让 main 进程在
 * IPC 入口也能用同一套严格校验(scanCode 不再用"长度+非纯字母"放宽规则)。
 * 渲染依赖(bwip-js / Canvas)留在本文件,其他纯文本类型/函数 re-export 自 shared。
 *
 * ─── 为什么要这个文件 ─────────────────────────────────────────
 *
 * bwip-js 的 `bcid: 'gs1datamatrix'` 模式接受 `(01)X(21)Y(91)Z(92)W` parens 形式作为输入,
 * 但俄罗斯 KM 的 AI 21 序列号字符集 82 **包含 `(` 和 `)`**(比如 `%btZHR((Aekm`、
 * `%C:x0Kg<FKhM`),parens 形式无法歧义解析这些字符——bwip-js 的 parens parser 把
 * serial 里的 `(` 当成 AI 边界,结果:
 *
 *   ① 校验侧把合法码误判为"结构不合规"(用户截图中 1111/12000 = 9.25% 假阳性)
 *   ② 渲染侧实际编码出来的 DM 字节是错的,ЧЗ.Бизнес 解码失败
 *
 * 解决:**完全跳过 parens 中间格式**,把 raw 串直接解析成结构化 AI 段数组,
 * 再用 `^FNC1` + 段值的形式喂给 bwip-js 的 `bcid: 'datamatrix' + parsefnc:true`。
 */

import bwipjs from 'bwip-js/browser'
import {
  FIXED_LEN,
  GS,
  type AiSegment,
  rawToGs1Segments,
  hasRussianKmAis,
} from './gs1Parse'

// re-export 让原有 6 处 renderer 引用无需改动
export { GS, type AiSegment, rawToGs1Segments, hasRussianKmAis }

/**
 * AiSegment[] → bwip-js datamatrix + parsefnc 接受的字符串。
 *
 *   - 开头 `^FNC1` → bwip-js 在 codeword 0 写入 FNC1 codeword (232),
 *     这是 GS1 DM 模式标志(俄罗斯 ЧЗ.Бизнес 判 GS1 DM 的硬条件)
 *   - 变长 AI 之后插**字面 0x1D 字节**(GS 字符),不能再用 `^FNC1`!
 *     这条曾经是 bug 来源:之前 AI 间也用 `^FNC1` → bwip-js 编成 codeword 232 →
 *     ЧЗ.Бизнес 显示为 `{FNC1}{FNC1}{FNC1}` 三连 FNC1 → 判结构非法。
 *     合规 GS1 DM 要求首位 FNC1 codeword + AI 间 0x1D 字节(普通 ASCII,
 *     扫码时显示为 `{GS}`)—— 客户的合法码就是这种结构。
 *   - fixed-length AI(01/02/03/...)后不需要任何分隔符
 *   - value 里的 `^` → `^^` 转义(避免 bwip-js parsefnc 误读为 `^FNCx`)
 */
export function segmentsToFncText(segs: AiSegment[]): string {
  const esc = (v: string) => v.replace(/\^/g, '^^')
  let out = '^FNC1'
  for (let k = 0; k < segs.length; k++) {
    out += segs[k].ai + esc(segs[k].value)
    // 后面还有 AI 且当前是变长 → 插 0x1D(不是 FNC1 codeword)
    if (k < segs.length - 1 && FIXED_LEN[segs[k].ai] === undefined) {
      out += GS
    }
  }
  return out
}

/**
 * 严格校验:raw 能解析成 GS1 AI 段,且必备 4 个俄罗斯 KM AI 都在,且 bwip-js 能成功编码。
 *
 * 返回 false 时 UI 应把序号标红提示"不符合规范"。
 */
export async function validateRussianKm(raw: string): Promise<boolean> {
  const segs = rawToGs1Segments(raw)
  if (!segs) return false
  if (!hasRussianKmAis(segs)) return false
  try {
    await (bwipjs as any).toCanvas(document.createElement('canvas'), {
      bcid: 'datamatrix',
      text: segmentsToFncText(segs),
      parsefnc: true,
      scale: 1,
      padding: 0,
      backgroundcolor: 'ffffff',
    })
    return true
  } catch {
    return false
  }
}
