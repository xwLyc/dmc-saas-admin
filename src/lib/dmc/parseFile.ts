/**
 * DMC 文件解析 + 导出 —— 复用桌面端 parseSourceFile 的逻辑。
 *
 * 关键陷阱(从桌面端继承):
 *   CSV: **不能走 SheetJS**!俄罗斯 KM serial 字符集 82 允许 `,`,SheetJS 会误切列。
 *        改用 `file.text() + split('\n')` 按整行读。
 *   XLSX: 双列形态识别(见 parseSourceFile pickCellFromRow 注释):
 *        - 形态 1: 客户 ERP 双列(短码+全签名),取最长
 *        - 形态 1.5: 某 cell 自身已是合法 KM,取最长合法
 *        - 形态 2: xlsx-from-csv 切碎,用 `,` join 还原
 *
 * 导出 CSV 必须 quote 含 `,` 的字段:DMC 码本身可能含逗号,不 quote 工厂打开后会
 * 看到错列。这里手写 CSV 转义而不是依赖 SheetJS bookType:'csv'(它不一定 quote 全).
 */

import * as XLSX from 'xlsx'
import { parseSourceFile } from './parseSourceFile'
import { rawToGs1Segments } from './gs1Parse'

export interface ParsedDmcFile {
  total: number
  codes: string[]
  filename: string
}

export async function parseDmcFile(file: File): Promise<ParsedDmcFile> {
  const codes = await parseSourceFile(file, {
    // 表头匹配:首行单格是这些关键字时跳过
    headerPattern: /^(code|码|条码|DMC|DMC码|barcode|raw|rawImport)$/i,
    // 多列形态 1.5 判别:这个 cell 自身是合法 GS1 → 优先
    isValidKm: (s) => rawToGs1Segments(s) !== null,
  })

  if (codes.length === 0) {
    throw new Error('未解析到任何 DMC 码,请检查文件格式')
  }

  return {
    total: codes.length,
    codes,
    filename: file.name,
  }
}

/**
 * 导出 DMC + 序号到 csv 或 xlsx。
 *   - 两列:序号 | DMC码
 *   - CSV 手写转义:任何含 `,` / `"` / 换行 的字段加双引号,内部 `"` 转 `""`
 *     (RFC 4180,标签厂用 Excel 打开必能正确分列)
 *   - XLSX 走 SheetJS aoa_to_sheet,无需手转义
 *   - 中文列名(工厂老板看得懂)
 */
export function exportSeqDmc(
  rows: Array<{ seq: string; dmc: string }>,
  filename: string,
  format: 'csv' | 'xlsx',
): void {
  const ext = format === 'csv' ? '.csv' : '.xlsx'
  const fullName = filename.endsWith(ext) ? filename : filename + ext

  if (format === 'csv') {
    // 手写 RFC 4180 CSV:含逗号/双引号/换行的字段全 quote
    // 无表头:工厂/标签厂直接拿数据用,加表头反而要他们额外处理
    const lines: string[] = []
    for (const r of rows) {
      lines.push(`${csvField(r.seq)},${csvField(r.dmc)}`)
    }
    // BOM + CRLF:Excel 打开中文文件时强烈依赖 UTF-8 BOM 否则乱码
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, fullName)
  } else {
    // 无表头(同 CSV)
    const data = rows.map((r) => [r.seq, r.dmc])
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 24 }, { wch: 80 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DMC')
    XLSX.writeFile(wb, fullName, { bookType: 'xlsx' })
  }
}

/** RFC 4180 CSV 字段转义:含 , / " / 换行 时 quote 包裹,内部 " 转 "" */
function csvField(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
