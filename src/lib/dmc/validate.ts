/**
 * DMC 3 步校验 —— 从 desktop dmc-import-analysis.service.ts 抽出。
 *
 * 同源逻辑(任何改动两边都要 sync,后续可考虑抽到 contracts 包):
 *   Step 1. 文件内重复检测(同一文件 code 重复)
 *   Step 2. 长度一致性检测(取众数,长度 ≠ 众数 标红)
 *   Step 3. GS1 格式校验(rawToGs1Segments 解析失败 标红)
 *
 * fast-fail:任何一步发现异常立即停,不继续后面 step。
 */

import { rawToGs1Segments } from './gs1Parse'
import type {
  AnalysisAnomaly,
  AnalysisResult,
  AnalysisStage,
  AnalysisStepState,
} from './types'

interface CodeItem {
  code: string
  rawImport?: string | null
}

export function analyzeDmcCodes(
  codes: CodeItem[],
  onStepUpdate?: (stage: AnalysisStage, state: AnalysisStepState) => void,
): AnalysisResult {
  const steps: Record<AnalysisStage, AnalysisStepState> = {
    file_dedup: { status: 'pending' },
    length_check: { status: 'pending' },
    format_check: { status: 'pending' },
  }

  const update = (stage: AnalysisStage, state: AnalysisStepState) => {
    steps[stage] = state
    onStepUpdate?.(stage, state)
  }

  // ─── Step 1: 文件内重复检测 ───
  update('file_dedup', { status: 'running' })
  const { unique, fileDuplicates } = detectFileDuplicates(codes)
  if (fileDuplicates.length > 0) {
    update('file_dedup', { status: 'failed', anomalies: fileDuplicates })
    return { steps, passed: false, uniqueCodes: [], failedStage: 'file_dedup' }
  }
  update('file_dedup', {
    status: 'passed',
    stats: { uniqueCount: unique.length, duplicateCount: 0 },
  })

  // ─── Step 2: 长度一致性检测(取众数) ───
  update('length_check', { status: 'running' })
  const { baselineLength, mismatches } = detectLengthOutliers(unique)
  if (mismatches.length > 0) {
    update('length_check', {
      status: 'failed',
      stats: { baselineLength },
      anomalies: mismatches,
    })
    return { steps, passed: false, uniqueCodes: [], failedStage: 'length_check' }
  }
  update('length_check', { status: 'passed', stats: { baselineLength } })

  // ─── Step 3: GS1 格式校验 ───
  update('format_check', { status: 'running' })
  const formatAnomalies = detectFormatInvalid(unique)
  if (formatAnomalies.length > 0) {
    update('format_check', { status: 'failed', anomalies: formatAnomalies })
    return { steps, passed: false, uniqueCodes: [], failedStage: 'format_check' }
  }
  update('format_check', { status: 'passed' })

  return {
    steps,
    passed: true,
    uniqueCodes: unique.map((c) => c.code),
  }
}

// ─── 内部 ───

function detectFileDuplicates(codes: CodeItem[]): {
  unique: CodeItem[]
  fileDuplicates: AnalysisAnomaly[]
} {
  const firstSeen = new Map<string, number>()
  const unique: CodeItem[] = []
  const fileDuplicates: AnalysisAnomaly[] = []
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    const code = c.code
    const prior = firstSeen.get(code)
    if (prior !== undefined) {
      fileDuplicates.push({
        rowIndex: i,
        code,
        reasonText: `Excel 文件内重复(首次出现在第 ${prior + 1} 行)`,
        kind: 'file_duplicate',
      })
    } else {
      firstSeen.set(code, i)
      unique.push(c)
    }
  }
  return { unique, fileDuplicates }
}

function detectLengthOutliers(codes: CodeItem[]): {
  baselineLength: number
  mismatches: AnalysisAnomaly[]
} {
  const counts = new Map<number, number>()
  for (const c of codes) {
    const len = c.code.length
    counts.set(len, (counts.get(len) || 0) + 1)
  }
  let baselineLength = 0
  let maxCount = 0
  for (const [len, count] of counts) {
    if (count > maxCount || (count === maxCount && len > baselineLength)) {
      baselineLength = len
      maxCount = count
    }
  }
  const mismatches: AnalysisAnomaly[] = []
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c.code.length !== baselineLength) {
      mismatches.push({
        rowIndex: i,
        code: c.code,
        reasonText: `长度 ${c.code.length} 字符`,
        kind: 'length_mismatch',
      })
    }
  }
  return { baselineLength, mismatches }
}

function detectFormatInvalid(codes: CodeItem[]): AnalysisAnomaly[] {
  const anomalies: AnalysisAnomaly[] = []
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    const target = c.rawImport ?? c.code
    if (rawToGs1Segments(target) === null) {
      anomalies.push({
        rowIndex: i,
        code: c.code,
        reasonText: 'GS1 格式错乱(不是合法 AI 串)',
        kind: 'format_invalid',
      })
    }
  }
  return anomalies
}
