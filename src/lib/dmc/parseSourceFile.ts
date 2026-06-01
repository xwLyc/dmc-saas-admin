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
 * **CSV / TXT**（`.csv` / `.txt`）：
 *   绕开 XLSX 解析，按行读整行原始文本。原因：俄罗斯 KM AI 21 serial 字符集 82
 *   允许 `,`，没引号包裹时 XLSX 会把一条码按逗号切成多列。
 *   TXT 走同一分支：约定每行一条 DMC 码，空行跳过。
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
  const isLineBased = /\.(csv|txt)$/i.test(file.name)

  let codes: string[]
  if (isLineBased) {
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
