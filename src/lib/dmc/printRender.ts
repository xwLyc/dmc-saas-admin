/**
 * 打印 cell 内部绘制助手——DMCPrintPage 与 ProductPrintPage 共用。
 *
 * 一个 cell 的视觉布局（垂直从上到下，整块在 cell 内根据 fixedGrid 居中或顶部对齐）：
 *
 *     [X-Y 标签]      ← 仅当 cartonLabel 非空时占用一行；用于跟客户原始 PDF 对齐
 *     [ DM 矩阵 ]
 *     [ 序号文字 ]    ← 异常 / 渲染失败时标红
 *
 * 之前两个 print page 各维护一份相同的实现，导致：
 *   - 改一处忘记另一处（标签上移那次就动了 DMCPrintPage 没动 ProductPrintPage 的失败兜底分支）
 *   - 字号、间隙、颜色等魔术数字漂移
 *
 * 现在统一收口到这里，调用方只需提供 cell 区域 + 码字符串 + 序号文字 + 渲染函数。
 */

export type DrawDmcCellOptions = {
  /** 目标 canvas 的 2D 上下文 */
  ctx: CanvasRenderingContext2D
  /** Cell 区域：x/y 是左上角，w/h 是 cell 总尺寸，单位 px */
  cell: { x: number; y: number; w: number; h: number }
  /** true → 码块在 cell 内垂直居中（fixedGrid 模式）
   *  false → 码块顶部对齐（A4 长纸自动换行模式） */
  fixedGrid: boolean
  /** 要渲染的码原始字符串（喂给 renderDM 的入参） */
  code: string
  /** 显示在 DM 下方的序号文字（如 ADU000061 / SSCC 等）。空字符串也行（不画） */
  serial: string
  /** 显示在 DM 上方的 X-Y 对齐标签（如 "3-14"），空字符串 / undefined → 不画该行 */
  cartonLabel?: string
  /** true → 序号文字标红（GS1 校验失败的码）；
   *  渲染抛错也会自动强制标红，调用方无需重复传 */
  isAnomalous?: boolean
  /** DM 边长像素（mm2px 计算后） */
  codePx: number
  /** 序号字号像素 */
  serialFontPx: number
  /** 1mm 对应像素，用于 0.4mm/0.5mm 间隙换算 */
  mm2px: number
  /** 渲染 DM 矩阵的函数：
   *  屏幕预览传 utils/dmcCanvas.renderDataMatrix（scale=3）
   *  PDF 导出传 utils/dmcCanvas.renderDataMatrixHD（scale=8） */
  renderDM: (code: string, sizePx: number) => Promise<HTMLCanvasElement>
}

const FONT_FAMILY = '"JetBrains Mono", "Courier New", Courier, monospace'

/** 在指定 cell 区域画一个 DMC 码（DM + 序号 + 可选 X-Y 标签）。
 *  渲染失败保留序号 + 标签版位，DM 区域留白，序号自动标红方便定位。 */
export async function drawDmcCell(opts: DrawDmcCellOptions): Promise<void> {
  const {
    ctx, cell, fixedGrid, code, serial, cartonLabel,
    isAnomalous, codePx, serialFontPx, mm2px, renderDM,
  } = opts

  const showLabel = !!cartonLabel
  const labelFontPx = Math.max(8, Math.round(serialFontPx * 0.85))
  const labelDmGapPx = Math.round(0.4 * mm2px)
  const codeSerialGapPx = Math.round(0.5 * mm2px)
  const labelBlockH = showLabel ? labelFontPx + labelDmGapPx : 0
  const codeBlockH = labelBlockH + codePx + codeSerialGapPx + serialFontPx

  // 整块在 cell 内的垂直起点
  const blockTop = fixedGrid ? cell.y + (cell.h - codeBlockH) / 2 : cell.y
  // DM 矩阵的 y（在 label 行之下）
  const cy = blockTop + labelBlockH
  // DM 矩阵在 cell 内水平居中
  const cx = cell.x + (cell.w - codePx) / 2

  // ─── X-Y 对齐标签（DM 上方居中，灰色次级信息） ───
  if (showLabel) {
    ctx.fillStyle = '#6b7280'
    ctx.font = `500 ${labelFontPx}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(cartonLabel!, cell.x + cell.w / 2, blockTop)
  }

  // ─── DM 矩阵 ───
  let renderFailed = false
  try {
    const codeCanvas = await renderDM(code, codePx)
    ctx.drawImage(codeCanvas, cx, cy)
  } catch (err) {
    console.warn('[drawDmcCell] DM render fail:', err)
    renderFailed = true
  }

  // ─── 序号文字（DM 下方居中） ───
  // 异常 / 渲染失败 → 红字；否则黑字
  ctx.fillStyle = (isAnomalous || renderFailed) ? '#dc2626' : '#000000'
  ctx.font = `600 ${serialFontPx}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(serial, cell.x + cell.w / 2, cy + codePx + codeSerialGapPx)
}

/** 给定一个全局序号（1-based）和每箱件数，算出 "X-Y" 对齐标签字符串。
 *  perCarton ≤ 0 → 返回空字符串（调用方传给 drawDmcCell 后该行不画）。
 *
 *  例：globalSeq=14, perCarton=24 → "1-14"
 *      globalSeq=25, perCarton=24 → "2-1"
 */
export function makeCartonLabel(globalSeq: number, perCarton: number): string {
  if (!perCarton || perCarton <= 0) return ''
  const cartonNo = Math.floor((globalSeq - 1) / perCarton) + 1
  const itemNo = ((globalSeq - 1) % perCarton) + 1
  return `${cartonNo}-${itemNo}`
}
