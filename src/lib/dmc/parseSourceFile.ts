/**
 * 客户码源文件解析（xlsx/xls/csv/txt）—— 三处导入入口共用。
 *
 * 历史背景：以下三个组件最初各自实现了一份几乎相同的逻辑，
 *   - components/container/ProductFormModal.handleFileSelect
 *   - components/batch/CreateBatchModal.handleFileSelect
 *   - pages/DMCPrintPage.handleFileChange
 * 期间因为修客户的几种实际文件形态分别打补丁，三份不同步过几次。
 * 本 util 收口为单一入口，所有改动只发生在这里。
 *
 * ─── 处理的文件形态 ─────────────────────────────────────────────
 *
 * **CSV**（`.csv`）：
 *   **业务前提**:DMC 码源每行 = 一条码。GS1 AI 21 字符集允许 `,` `"`,所以我们**不
 *   split `,`** —— 整行(除去可能的 RFC 4180 quote 包裹)就是码。走 `,` split 会踩
 *   一堆 form 1.5 半截误判、多列 comma-join 边界之类的坑(实测 3 个客户文件全踩过)。
 *   处理规则:
 *     - 行首末都是 `"` 且 `"` 总数偶数 → 合法 RFC 4180 quoted line,去包 + `""` → `"`
 *     - 否则 → 整行原样(码含 `,` `"` 都保留)
 *   长度是否一致 / 是否合法 GS1 交给下游 analyzeDmcCodes 校验,parser 只负责"把每行
 *   完整还原成一条字符串"这一件事。
 *
 * **TXT**（`.txt`）：
 *   纯文本,无 quote 语义。每行一条 DMC 码,空行跳过。
 *
 * **XLSX/XLS**：每行可能多列，按下面双形态规则归一成一条码：
 *   形态 1（客户内部 ERP 双列）：A=GTIN+serial 短码（无 crypto，~31 字符），
 *     B=A 内容 + 91/92 完整签名（~83 字符）。特征是 B 包含 A 为严格前缀。
 *     → 取最长 cell（必须用带 crypto 的版本，否则 ЧЗ.Бизнес 报结构错）。
 *   形态 2（xlsx-from-csv 还原）：客户把 CSV 在 Excel 打开自动按 `,` 切列再另存
 *     xlsx，一行 `01..!,<pV91EE..` 被切成 [A=`01..!`, B=`<pV91EE..`]。
 *     → 用 `,` join 恢复原始码。
 *   判别：所有非空 cell 都是最长 cell 严格前缀 → 形态 1；否则 → 形态 2。
 *   单列直接拿那一列；空行返回空串（后续 filter 掉）。
 */

import * as XLSX from 'xlsx'

// ─── 双列 seq+DMC 格式识别 ────────────────────────────────────────────
//
// 场景:客户/自己给回一个已带序号的文件(`ADU00001,0104...` 或 `ADU00001\t0104...`),
// 或者 admin 之前的 CSV/XLSX 导出被回传。要么切掉 seq 列取 DMC,要么用 whole-line
// 把 `seq,DMC` 当一整条码存进去 → GS1 校验必挂。
//
// 判定策略:前 5 行抽样,每行都得符合 `短seq分隔长DMC(≥30字符)`,才认定 dual 格式。
// 分隔符支持 `,` 和 `\t`(标签厂 TXT 常用 Tab)。
// 抽样保守,不冒险 —— 一旦某行不符合就退回 whole-line。

/** dual 格式解析结果。importedStartSeq 用来给 DmcBatches 的起始序号 UI 预填。 */
export interface SeqDmcParseResult {
  codes: string[]
  importedStartSeq: string
}

const SEQ_DMC_PROBE_ROWS = 5

/** 尝试把文件按「seq + DMC 两列」解析。不像的话返回 null,调用方走 whole-line。 */
export async function parseSeqDmcFile(file: File): Promise<SeqDmcParseResult | null> {
  const isLineBased = /\.(csv|txt)$/i.test(file.name)

  // ─── CSV / TXT 分支 ───
  if (isLineBased) {
    let text = await file.text()
    if (text.length > 0 && text.charCodeAt(0) === 0xfeff) text = text.slice(1)

    const lines = text
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (lines.length === 0) return null

    // 抽样探测:前 N 行全都得符合 dual 才认定
    const probeCount = Math.min(SEQ_DMC_PROBE_ROWS, lines.length)
    for (let i = 0; i < probeCount; i++) {
      const p = splitFirstSep(lines[i])
      if (!p) return null
      const dmc = unquoteCsvField(p.after)
      if (!isLikelySeq(p.before) || dmc.length < 30) return null
    }

    const importedStartSeq = splitFirstSep(lines[0])!.before
    const codes: string[] = []
    for (const line of lines) {
      const p = splitFirstSep(line)
      // 中途某行切不出来 -> 把整行放进去,让下游 length_check 单独标异常,不影响整批
      codes.push(p ? unquoteCsvField(p.after) : line)
    }
    return { codes, importedStartSeq }
  }

  // ─── XLSX 分支 ───
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length === 0) return null

  let probed = 0
  for (let i = 0; i < rows.length && probed < SEQ_DMC_PROBE_ROWS; i++) {
    const row = rows[i]
    if (!Array.isArray(row)) return null
    const seq = String(row[0] ?? '').trim()
    const dmc = String(row[1] ?? '').trim()
    if (!seq && !dmc) continue  // 空行不算入抽样
    if (row.length < 2 || !isLikelySeq(seq) || dmc.length < 30) return null
    probed++
  }
  if (probed === 0) return null

  const firstNonEmpty = rows.find((r) => {
    if (!Array.isArray(r)) return false
    const s = String(r[0] ?? '').trim()
    const d = String(r[1] ?? '').trim()
    return s.length > 0 || d.length > 0
  })
  const importedStartSeq = firstNonEmpty ? String(firstNonEmpty[0] ?? '').trim() : ''
  const codes: string[] = []
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    const seq = String(row[0] ?? '').trim()
    const dmc = String(row[1] ?? '').trim()
    if (!seq && !dmc) continue
    codes.push(dmc)
  }
  if (codes.length === 0) return null
  return { codes, importedStartSeq }
}

/** 按第一个 `,` 或 `\t` 切前后两段。GS1 AI 21 字符集不含 `\t`,切 Tab 不误伤。 */
function splitFirstSep(line: string): { before: string; after: string } | null {
  const commaIdx = line.indexOf(',')
  const tabIdx = line.indexOf('\t')
  let idx: number
  if (commaIdx === -1 && tabIdx === -1) return null
  else if (commaIdx === -1) idx = tabIdx
  else if (tabIdx === -1) idx = commaIdx
  else idx = Math.min(commaIdx, tabIdx)
  return {
    before: line.slice(0, idx).trim(),
    after: line.slice(idx + 1).trim(),
  }
}

/** RFC 4180 字段 unquote:`"..."` 去首末 `"` + `""` → `"`。不带 quote 原样返回。 */
function unquoteCsvField(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

/**
 * 判定 seq 列。要求:
 *   - 非空、≤ 80 字符
 *   - 只含字母数字 / 中文 / `-_.`(避开 GS1 特征符 `<` `=` `/` `+` GS 等)
 *   - **纯数字 > 12 字符不算 seq**,避免客户码本身含 `,` 时前段(如
 *     `0104620478610363215` 19 字符 GTIN+AI21 头)被 dual 探测误命中吞掉真码。
 *     实际业务 seq 一般是 `ADU00001` 这种"前缀 + 数字",纯数字长串是 GS1 段。
 */
function isLikelySeq(s: string): boolean {
  if (!s) return false
  if (s.length > 80) return false
  if (/^\d+$/.test(s) && s.length > 12) return false
  return /^[A-Za-z0-9_\-.一-鿿]+$/.test(s)
}

export type ParseSourceOptions = {
  /** header 正则。匹配的码会从结果里剔除（仅适用首行肯定是表头的导入入口，
   *  例如 ProductFormModal）。DMCPrintPage 走单独的"自动判断/跳过/保留"UI，
   *  传 undefined 即可。 */
  headerPattern?: RegExp
  /**
   * 多列分歧时的"合法码判别"函数。
   *
   * 解决脏数据陷阱：用户在 col A 改了几个字符（不再是 col B 的前缀），形态 1 不命中，
   * 形态 2 的 comma-join 又会把 `A,B` 拼出来——拼起来碰巧 `length - 52` 位置落在
   * col B 原本的 `91` 上，启发式误判为合法 KM，但 serial 段是脏的（含 col A 残值 + 逗号）。
   *
   * 策略：形态 1 失败后，先看是否有单个 cell 自身就是合法码（`isValidKm(cell)` 为
   * true）；有 → 取最长的合法 cell，忽略其他 cell 的脏数据。一个都没有才退到形态 2
   * 的 comma-join 还原。不传此 option → 跳过这步检查（适合 SSCC 等非 KM 源文件）。
   */
  isValidKm?: (s: string) => boolean
}

/**
 * 解析码源文件成 string[]。每条字符串都已 trim、空行已过滤。
 *
 * 调用方负责：
 *   - 选择哪些字段映射到 code / raw_import（由后端 IPC 处理）
 *   - 表头识别 UI（如有，参考 looksLikeHeader）
 */
export async function parseSourceFile(
  file: File,
  options: ParseSourceOptions = {},
): Promise<string[]> {
  const { headerPattern, isValidKm } = options
  const isCsv = /\.csv$/i.test(file.name)
  const isTxt = /\.txt$/i.test(file.name)

  let codes: string[]
  if (isCsv) {
    let text = await file.text()
    // UTF-8 BOM (Excel 中文导出会带) —— String.trim() 规范上会 strip U+FEFF,但显式
    // 去更稳。留着会让首行被当成含 BOM 前缀的脏码。
    if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    codes = text
      .split(/\r?\n/)
      .map((line) => parseCsvLine(line.trim()))
      .filter((c) => c.length > 0)
  } else if (isTxt) {
    const text = await file.text()
    codes = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((c) => c.length > 0)
  } else {
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
    codes = rows
      .map((row) => pickCellFromRow(row, isValidKm))
      .filter((c) => c.length > 0)
  }

  // 表头过滤（可选）：仅匹配整行 trim 后等于 header 词的码会被剔除，
  // 不会误杀真实码（DMC 长度 ≥ 70 字符，不会和"code"/"DMC"等表头词碰撞）。
  if (headerPattern) {
    codes = codes.filter((c) => !headerPattern.test(c))
  }

  return codes
}

/**
 * CSV 单行解析:整行 = 一条码,不 split `,`。
 *
 * 处理两种情况:
 *   1. 行首末都是 `"` 且 `"` 总数偶数 → 合法 RFC 4180 quoted line
 *      → 去首末 `"` + 内部 `""` 还原成 `"`
 *      客户 45120 文件所有含 `"` 的行都走这里
 *   2. 否则 → 整行原样保留(空行由外层 filter 掉)
 *      - 码含 `,` 也保留(GS1 AI 21 字符集允许 `,`,客户 86400/164 文件都有)
 *      - 码含 `"` 也保留(same,客户实际文件常见)
 *
 * 为啥不 split `,`:DMC 码源约定"每行一条码",split 会误拆本来完整的码。之前的
 * comma-join 兜底 + form 1.5 isValidKm 判定又踩了一堆半截误判的坑,不如直接不 split。
 */
function parseCsvLine(line: string): string {
  if (line.length === 0) return ''
  if (
    line.length >= 2 &&
    line.charCodeAt(0) === 0x22 &&  // "
    line.charCodeAt(line.length - 1) === 0x22
  ) {
    let quotes = 0
    for (let i = 0; i < line.length; i++) {
      if (line.charCodeAt(i) === 0x22) quotes++
    }
    if (quotes % 2 === 0) {
      return line.slice(1, -1).replace(/""/g, '"')
    }
  }
  return line
}

/**
 * 从一行多列里挑一个合理的 KM 字符串。
 *
 * 决策树（顺序敏感，先满足先返回）：
 *   空行     → 返回 ''（外层 filter 掉）
 *   单 cell  → 直接拿
 *   多 cell  → 形态 1: 所有非空 cell 都是最长的前缀（短+完整双列）→ 取最长
 *           → 形态 1.5（仅当传了 isValidKm）: 某个 cell 单独已是合法码 → 取最长合法
 *             ↑ 防止"用户在 col A 改坏字符 → 形态 1 失败 → 走 comma-join → 91/92 位置
 *               碰巧对、产生脏数据混合 KM"的陷阱
 *           → 形态 2: 上面都不命中 → comma-join 还原（xlsx-from-csv 切碎场景），
 *             **保留中间的空 cell**——它们代表原始 CSV 里的连续 `,`，丢了会导致
 *             serial 段比真实短若干字符。仅丢掉 trailing empties（xlsx padding）。
 */
function pickCellFromRow(row: any[] | undefined, isValidKm?: (s: string) => boolean): string {
  // 1) 全部 cell trim 一遍，**先不 filter**——形态 2 需要保留中间空 cell 的位置信息
  const allCells = (row || []).map((cell) => String(cell ?? '').trim())

  // 2) 砍掉 trailing empties（xlsx 行宽 padding，没语义）
  let lastNonEmpty = -1
  for (let i = 0; i < allCells.length; i++) {
    if (allCells[i].length > 0) lastNonEmpty = i
  }
  if (lastNonEmpty < 0) return ''           // 整行空

  const cells = allCells.slice(0, lastNonEmpty + 1)
  const nonEmpty = cells.filter((c) => c.length > 0)

  // 3) 单 cell（不论位置）：直接拿
  if (nonEmpty.length === 1) return nonEmpty[0]

  // 4) 形态 1：所有非空 cell 都是最长的前缀
  const longest = nonEmpty.reduce((b, c) => (c.length > b.length ? c : b))
  if (nonEmpty.every((c) => longest.startsWith(c))) return longest

  // 5) 形态 1.5：某个 cell 自己就是合法 KM
  if (isValidKm) {
    const valids = nonEmpty.filter((c) => isValidKm(c))
    if (valids.length > 0) {
      return valids.reduce((b, c) => (c.length > b.length ? c : b))
    }
  }

  // 6) 形态 2：用 `,` 拼，**包含中间的空 cell**——
  //    Excel 把 `0106...215!,e,,,,_91EE...=` 按 `,` 切成 [`0106...215!`, `e`, ``, ``, ``, `_91EE...=`]，
  //    join `,` 才能复原成 `0106...215!,e,,,,_91EE...=`，serial 段长度才对得上。
  return cells.join(',')
}
