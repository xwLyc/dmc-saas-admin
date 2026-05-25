/**
 * DMC 校验共享类型 —— 跟 desktop src/shared/dmc-import.ts 同步。
 * Admin 只做 3 步校验(file_dedup / length_check / format_check),
 * 不做 cross_check 和 db_insert(那两个需要持久化,后续 phase)。
 */

export type AnalysisStage =
  | 'file_dedup'
  | 'length_check'
  | 'format_check'

export type AnalysisStatus = 'pending' | 'running' | 'passed' | 'failed'

export interface AnalysisAnomaly {
  rowIndex: number       // 0-based,UI 显示 +1
  code: string
  reasonText: string
  kind: 'file_duplicate' | 'length_mismatch' | 'format_invalid'
}

export interface AnalysisStepState {
  status: AnalysisStatus
  /** passed/failed 时填 */
  stats?: {
    uniqueCount?: number
    duplicateCount?: number
    baselineLength?: number
  }
  /** failed 时填,完整列表 */
  anomalies?: AnalysisAnomaly[]
}

export interface AnalysisResult {
  /** 全部 step 状态 */
  steps: Record<AnalysisStage, AnalysisStepState>
  /** 是否整批通过(3 步都 passed)*/
  passed: boolean
  /** 通过时,去重后的码列表(给后续 seq 配置用) */
  uniqueCodes: string[]
  /** 失败时,哪个 stage 卡住 */
  failedStage?: AnalysisStage
}

export const STAGE_LABELS: Record<AnalysisStage, string> = {
  file_dedup: '文件内重复检测',
  length_check: '长度一致性检测',
  format_check: 'GS1 格式校验',
}

export const STAGE_ORDER: AnalysisStage[] = ['file_dedup', 'length_check', 'format_check']
