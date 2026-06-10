/**
 * DMC 打印预览 —— 给标签厂发文件前自查的最后一道关。
 *
 * 渲染 N 条 DMC 码成可打印的 A4 排版,用户用扫码枪扫几个,确认跟源码一致后再发厂。
 *
 * 实现:
 *   - 复用桌面端的 dmcCanvas.renderDataMatrix(bwip-js + parsefnc 路径,跟工厂打码机一致)
 *   - 每页 12 个码 (3×4 grid),码 30mm 边长,DMC 下方显序号
 *   - 用 HTML grid + 每 cell 一个 canvas,浏览器 print 时按 CSS @media print 排版
 *   - 默认前 24 条 (2 页),起始行 / 条数可调
 *   - 渲染异步,带进度条,不冻 UI
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Modal, Button, InputNumber, Space, Typography, Progress, Alert, Spin,
} from 'antd'
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons'
import { renderDataMatrix } from '@/lib/dmc/dmcCanvas'

interface CodeRow {
  seq: string
  dmc: string
}

export interface DmcPrintPreviewProps {
  open: boolean
  onClose: () => void
  /** 全量码列表(序号 + DMC)。从 DmcBatches 的 assigned 传进来 */
  codes: CodeRow[]
}

const COLS_PER_PAGE = 8
const ROWS_PER_PAGE = 8
const CODES_PER_PAGE = COLS_PER_PAGE * ROWS_PER_PAGE   // 64
const DMC_SIZE_MM = 18      // cell ~22mm × ~32mm,DMC 18mm + 序号 ~3mm,余白可读
const MM_PER_PX_SCREEN = 96 / 25.4  // 96dpi 屏幕,1mm ≈ 3.78px
const DMC_SIZE_PX = Math.round(DMC_SIZE_MM * MM_PER_PX_SCREEN)

export default function DmcPrintPreview({ open, onClose, codes }: DmcPrintPreviewProps) {
  const [startIdx, setStartIdx] = useState(1)   // 1-based 行号,UI 直观
  // 默认 128 = 2 页,这样翻页按钮立刻能点
  const [count, setCount] = useState(128)
  const [renderState, setRenderState] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderError, setRenderError] = useState<string | null>(null)
  // 当前要展示的码 (按 startIdx + count 切)
  const [slicedCodes, setSlicedCodes] = useState<CodeRow[]>([])
  // 屏幕显示哪一页 (0-indexed)。打印时所有页都显示
  const [currentPage, setCurrentPage] = useState(0)
  // canvas refs 数组,按 sliced 索引
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  // 用 token 防止两次快速切换被串了
  const renderTokenRef = useRef(0)

  // ─── 计算分页 ───
  const totalPages = Math.ceil(slicedCodes.length / CODES_PER_PAGE)
  const maxStart = Math.max(1, codes.length - count + 1)

  // ─── 触发渲染 ───
  const handleRender = useCallback(async () => {
    setRenderError(null)
    const clampedStart = Math.max(1, Math.min(startIdx, codes.length))
    const clampedCount = Math.max(1, Math.min(count, codes.length - clampedStart + 1))
    const slice = codes.slice(clampedStart - 1, clampedStart - 1 + clampedCount)
    setSlicedCodes(slice)
    setCurrentPage(0)  // 重新渲染就回到第 1 页
    canvasRefs.current = new Array(slice.length).fill(null)
    setRenderState('rendering')
    setRenderProgress(0)

    const token = ++renderTokenRef.current
    // 等下一帧让 React 把 canvas 都挂上 DOM,再开始渲染
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    try {
      for (let i = 0; i < slice.length; i++) {
        if (token !== renderTokenRef.current) return  // 被新一轮抢占
        const target = canvasRefs.current[i]
        if (!target) continue
        // dmcCanvas.renderDataMatrix 返回新 canvas,我们 drawImage 到目标
        const dm = await renderDataMatrix(slice[i].dmc, DMC_SIZE_PX)
        const ctx = target.getContext('2d')
        if (!ctx) continue
        target.width = DMC_SIZE_PX
        target.height = DMC_SIZE_PX
        ctx.drawImage(dm, 0, 0)
        if (i % 4 === 0 || i === slice.length - 1) {
          setRenderProgress(Math.round(((i + 1) / slice.length) * 100))
          // 让出主线程,UI 不冻
          await new Promise((r) => setTimeout(r, 0))
        }
      }
      if (token === renderTokenRef.current) {
        setRenderProgress(100)
        setRenderState('done')
      }
    } catch (err) {
      if (token === renderTokenRef.current) {
        setRenderError(err instanceof Error ? err.message : '渲染失败')
        setRenderState('error')
      }
    }
  }, [codes, startIdx, count])

  // 打开 / 起始 / 条数变了就重渲(防抖 200ms 防止 InputNumber 连续触发)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(handleRender, 200)
    return () => clearTimeout(t)
  }, [open, handleRender])

  // 关闭时取消渲染
  useEffect(() => {
    if (!open) {
      renderTokenRef.current++
      setRenderState('idle')
      setSlicedCodes([])
    }
  }, [open])

  // ─── 打印 ───
  const handlePrint = () => {
    if (renderState !== 'done') return
    window.print()
  }

  // 分页切 slice
  const pages: CodeRow[][] = []
  for (let i = 0; i < slicedCodes.length; i += CODES_PER_PAGE) {
    pages.push(slicedCodes.slice(i, i + CODES_PER_PAGE))
  }

  return (
    <>
      {/* 打印 CSS:打印时只显示 .dmc-print-area,所有页都展开 + 强制 display 防止屏幕分页态隐藏 */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .dmc-print-area, .dmc-print-area * { visibility: visible !important; }
          .dmc-print-area {
            position: absolute !important;
            top: 0; left: 0;
            width: 100% !important;
            background: white !important;
          }
          .dmc-print-page {
            display: grid !important;
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
          }
          .dmc-print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
        @page {
          size: A4;
          margin: 10mm;
        }
      `}</style>

      <Modal
        open={open}
        title={
          <Space>
            <PrinterOutlined />
            DMC 打印预览 (扫码验证)
          </Space>
        }
        onCancel={onClose}
        width={900}
        footer={[
          <Button key="close" onClick={onClose}>关闭</Button>,
          <Button
            key="rerender" icon={<ReloadOutlined />}
            onClick={handleRender}
            disabled={renderState === 'rendering'}
          >
            重新渲染
          </Button>,
          <Button
            key="print" type="primary" icon={<PrinterOutlined />}
            onClick={handlePrint}
            disabled={renderState !== 'done'}
          >
            打印 ({totalPages} 页)
          </Button>,
        ]}
      >
        <Space style={{ marginBottom: 16 }} wrap>
          <span>起始行</span>
          <InputNumber
            min={1} max={codes.length}
            value={startIdx}
            onChange={(v) => setStartIdx(v ?? 1)}
            style={{ width: 100 }}
          />
          <span>条数</span>
          <InputNumber
            min={1} max={Math.min(640, codes.length)}
            value={count}
            onChange={(v) => setCount(v ?? 128)}
            style={{ width: 100 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            共 {codes.length} 条,显示 {Math.min(startIdx + count - 1, codes.length)} 行(范围 {startIdx}-{Math.min(startIdx + count - 1, codes.length)})
            {totalPages > 0 && ` · ${totalPages} 页 A4`}
          </Typography.Text>
          {startIdx > maxStart && (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              ⚠ 起始 + 条数 超出总条数,会自动截断
            </Typography.Text>
          )}
        </Space>

        {renderState === 'rendering' && (
          <div style={{ marginBottom: 12 }}>
            <Progress percent={renderProgress} status="active" size="small" />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              正在渲染 DMC 矩阵...
            </Typography.Text>
          </div>
        )}

        {renderState === 'error' && (
          <Alert
            type="error" showIcon
            message="渲染失败"
            description={renderError}
            style={{ marginBottom: 12 }}
          />
        )}

        {/* 翻页控制(打印模式由 print CSS 全展开,屏幕只看当前页) */}
        {totalPages > 0 && renderState !== 'idle' && (
          <Space style={{ marginBottom: 12 }}>
            <Button
              size="small"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            >
              上一页
            </Button>
            <Typography.Text>
              第 {currentPage + 1} / {totalPages} 页
              <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                (每页 {CODES_PER_PAGE} 个,本页第 {currentPage * CODES_PER_PAGE + 1}-{Math.min((currentPage + 1) * CODES_PER_PAGE, slicedCodes.length)} 条)
              </Typography.Text>
            </Typography.Text>
            <Button
              size="small"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              下一页
            </Button>
          </Space>
        )}

        {/* 预览区(打印时也是用这个区域) */}
        <div className="dmc-print-area">
          {pages.map((pageCodes, pageIdx) => (
            <div
              key={pageIdx}
              className="dmc-print-page"
              style={{
                width: '210mm',
                minHeight: '277mm',
                padding: '10mm',
                margin: '0 auto 20px',
                background: 'white',
                border: '1px solid #d9d9d9',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                // 屏幕模式只显示当前页;@media print 会强制 display: grid 把所有页展开
                display: pageIdx === currentPage ? 'grid' : 'none',
                gridTemplateColumns: `repeat(${COLS_PER_PAGE}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS_PER_PAGE}, 1fr)`,
                gap: '3mm',
              }}
            >
              {pageCodes.map((c, cellIdx) => {
                const globalIdx = pageIdx * CODES_PER_PAGE + cellIdx
                return (
                  <div
                    key={c.seq}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1mm',
                    }}
                  >
                    <canvas
                      ref={(el) => { canvasRefs.current[globalIdx] = el }}
                      style={{
                        width: `${DMC_SIZE_MM}mm`,
                        height: `${DMC_SIZE_MM}mm`,
                        imageRendering: 'pixelated',
                      }}
                    />
                    <div
                      style={{
                        marginTop: '1mm',
                        fontSize: '8pt',
                        fontFamily: '"JetBrains Mono", "Courier New", monospace',
                        fontWeight: 600,
                        textAlign: 'center',
                      }}
                    >
                      {c.seq}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {renderState === 'idle' && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
