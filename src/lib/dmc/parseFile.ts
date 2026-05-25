/**
 * DMC 文件解析 —— 支持 csv / xlsx。
 *
 * 容错:
 *   - 跳过空行
 *   - trim 后非空才视为码
 *   - 列名匹配优先级:'DMC' / 'DMC码' / 'dmc' / 'code' / 'raw';否则取第一列
 *   - BOM 自动去除(SheetJS 内置)
 */

import * as XLSX from 'xlsx'

const DMC_COLUMN_KEYS = ['DMC', 'DMC码', 'dmc', 'code', '码', 'raw', 'rawImport']

export interface ParsedDmcFile {
  /** 总行数(去空行后) */
  total: number
  /** 提取的 DMC 码列表(顺序跟文件一致) */
  codes: string[]
  /** 文件名(显示用) */
  filename: string
}

export async function parseDmcFile(file: File): Promise<ParsedDmcFile> {
  const buf = await file.arrayBuffer()
  // 不限定 csv/xlsx,SheetJS 自动识别
  const wb = XLSX.read(buf, { type: 'array' })
  const firstSheet = wb.Sheets[wb.SheetNames[0]]
  if (!firstSheet) throw new Error('文件没有 sheet 或为空')

  // 转 array of array(保留原始位置 + 列名行)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  if (rows.length === 0) throw new Error('文件为空')

  // 判断第一行是不是表头:看是否含已知 DMC 列名关键字
  const firstRow = rows[0].map((c) => String(c ?? '').trim())
  const headerColIdx = firstRow.findIndex((cell) => DMC_COLUMN_KEYS.includes(cell))
  let dataRows: unknown[][]
  let dmcColIdx: number

  if (headerColIdx >= 0) {
    // 有表头
    dataRows = rows.slice(1)
    dmcColIdx = headerColIdx
  } else {
    // 没表头,取第一列
    dataRows = rows
    dmcColIdx = 0
  }

  const codes: string[] = []
  for (const row of dataRows) {
    const raw = String(row[dmcColIdx] ?? '').trim()
    if (!raw) continue // 跳过空行
    codes.push(raw)
  }

  if (codes.length === 0) throw new Error('文件没有有效的 DMC 码')

  return {
    total: codes.length,
    codes,
    filename: file.name,
  }
}

/**
 * 导出 DMC + 序号到 csv 或 xlsx。
 *   - 两列:序号(seq) | DMC码(dmc)
 *   - 中文列名(工厂老板看得懂)
 *   - 自动下载
 */
export function exportSeqDmc(
  rows: Array<{ seq: string; dmc: string }>,
  filename: string,
  format: 'csv' | 'xlsx',
): void {
  const data = [
    ['序号', 'DMC码'],
    ...rows.map((r) => [r.seq, r.dmc]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // 列宽
  ws['!cols'] = [{ wch: 24 }, { wch: 80 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'DMC')

  const ext = format === 'csv' ? '.csv' : '.xlsx'
  const fullName = filename.endsWith(ext) ? filename : filename + ext

  if (format === 'csv') {
    XLSX.writeFile(wb, fullName, { bookType: 'csv' })
  } else {
    XLSX.writeFile(wb, fullName, { bookType: 'xlsx' })
  }
}
