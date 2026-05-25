/**
 * 序号生成 —— 跟 desktop PrintWorkspace.nextSeq 完全一致。
 *
 * 设计:
 *   - 用户输入起始序号字符串(如 'ADU000001')
 *   - 自动识别"前缀 + 末尾连续数字"两段
 *   - 数字 +1 递增,补零到原长度
 *
 * 例:
 *   nextSeq('ADU000001', 1) → 'ADU000001'   (第 1 张 = 起始号本身)
 *   nextSeq('ADU000001', 2) → 'ADU000002'
 *   nextSeq('ADU000001', 480) → 'ADU000480'
 *   nextSeq('客户A-001', 5) → '客户A-005'
 */

export function nextSeq(startCode: string, offset: number): string {
  const trimmed = (startCode || '').trim() || 'ADU000001'
  const match = trimmed.match(/^(.*?)(\d+)$/)
  if (!match) {
    // 没有末尾数字 → 用 6 位补零追加
    return `${trimmed}${String(offset - 1).padStart(6, '0')}`
  }
  const prefix = match[1]
  const numStr = match[2]
  const startNum = parseInt(numStr, 10)
  const padLen = numStr.length
  return `${prefix}${String(startNum + offset - 1).padStart(padLen, '0')}`
}

/** 给一批 code 配序号:[(seq, code)] */
export function assignSeqs(
  codes: string[],
  startSeq: string,
): Array<{ seq: string; dmc: string }> {
  return codes.map((dmc, i) => ({
    seq: nextSeq(startSeq, i + 1),
    dmc,
  }))
}
