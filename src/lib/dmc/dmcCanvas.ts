/**
 * DMC canvas 渲染助手——DMCPrintPage 与 ProductPrintPage 共用。
 *
 * 两个 print page 原本各自维护一份 `renderDataMatrix` / `renderDataMatrixHD`，
 * 现统一收口到这里。两个 scale 档位：
 *   - 3 用于屏幕预览（足够清晰，渲染快）
 *   - 8 用于 PDF 高清导出
 *
 * 尝试顺序（每个尺寸都一样）：
 *   1. raw → AiSegment[] → ^FNC1 串 → bwip-js datamatrix + parsefnc
 *      （俄罗斯 ЧЗ.Бизнес 通过的路径）
 *   2. 上面失败 → 普通 datamatrix（不带 FNC1 codeword）兜底，能打但不过俄罗斯认证
 *
 * 都用 imageSmoothingEnabled = false + 像素级 drawImage 缩放，保证每个 DM 模块
 * 不被插值糊掉。
 */

import bwipjs from 'bwip-js/browser'
import { rawToGs1Segments, segmentsToFncText } from './gs1Encode'

/**
 * 内部：跑 bwip-js 出 raw canvas（不缩放，bwip-js 自己按 scale 算尺寸）
 */
async function renderRawCanvas(text: string, scale: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  const segs = rawToGs1Segments(text)
  if (segs) {
    try {
      await (bwipjs as any).toCanvas(canvas, {
        bcid: 'datamatrix',
        text: segmentsToFncText(segs),
        parsefnc: true,
        scale,
        padding: 0,
        backgroundcolor: 'ffffff',
      })
      return canvas
    } catch (err) {
      console.warn('[DM] datamatrix+FNC1 失败，退回 plain datamatrix:', err)
    }
  }
  // Fallback：不过俄罗斯认证但能打。
  // 不开 parsefnc 避免 raw 字节里的 ^ 被误吞。
  await (bwipjs as any).toCanvas(canvas, {
    bcid: 'datamatrix',
    text,
    scale,
    padding: 0,
    backgroundcolor: 'ffffff',
  })
  return canvas
}

/**
 * 缩放 raw canvas 到目标 sizePx × sizePx 的正方形。
 * 用 nearest-neighbor (`imageSmoothingEnabled = false`) 保持像素锐利。
 */
function scaleCanvas(raw: HTMLCanvasElement, sizePx: number): HTMLCanvasElement {
  const scaled = document.createElement('canvas')
  scaled.width = sizePx
  scaled.height = sizePx
  const ctx = scaled.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(raw, 0, 0, sizePx, sizePx)
  return scaled
}

/** 屏幕预览级 DM（scale 3，渲染快、像素够清楚） */
export async function renderDataMatrix(text: string, sizePx: number): Promise<HTMLCanvasElement> {
  const raw = await renderRawCanvas(text, 3)
  return scaleCanvas(raw, sizePx)
}

/** 高清 DM（scale 8，给 PDF 导出用） */
export async function renderDataMatrixHD(text: string, sizePx: number): Promise<HTMLCanvasElement> {
  const raw = await renderRawCanvas(text, 8)
  return scaleCanvas(raw, sizePx)
}
