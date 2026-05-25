/**
 * KpiCard —— 数据看板顶部 KPI 块,共享组件。
 *
 * 视觉:渐变背景 + 彩色 icon 圆角块 + 大字数字 + 浅色 label + hover lift。
 * Dashboard / Subscriptions 等页面共用,保证 KPI 视觉节奏一致。
 */

import type { ReactNode } from 'react'

// 现代 SaaS 看板色板(Tailwind 风格,比 antd 默认更柔和)
export const COLORS = {
  primary: '#6366f1',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  gold: '#eab308',
  slate: '#64748b',
}

export type ColorKey = keyof typeof COLORS

export const KPI_TONE: Record<ColorKey, { bg: string; ring: string; text: string }> = {
  primary: { bg: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', ring: '#6366f1', text: '#4338ca' },
  success: { bg: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', ring: '#10b981', text: '#047857' },
  warning: { bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', ring: '#f59e0b', text: '#b45309' },
  danger:  { bg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', ring: '#ef4444', text: '#b91c1c' },
  purple:  { bg: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', ring: '#8b5cf6', text: '#6d28d9' },
  cyan:    { bg: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)', ring: '#06b6d4', text: '#0e7490' },
  pink:    { bg: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)', ring: '#ec4899', text: '#be185d' },
  gold:    { bg: 'linear-gradient(135deg, #fefce8 0%, #fef08a 100%)', ring: '#eab308', text: '#a16207' },
  slate:   { bg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', ring: '#64748b', text: '#475569' },
}

export interface KpiCardProps {
  tone: ColorKey
  icon: ReactNode
  label: string
  value: number
  /** 'plain' = 普通整数 | 'money' = ¥ 千分位 2 位 */
  fmt?: 'plain' | 'money'
  /** highlight 模式 0 时退化为浅灰(避免无意义高亮);非 0 时仍按 tone 染色 */
  highlight?: boolean
  suffix?: string
}

export function KpiCard({ tone, icon, label, value, fmt = 'plain', highlight = false, suffix }: KpiCardProps) {
  const t = KPI_TONE[tone]
  const showColor = !highlight || value > 0
  return (
    <div
      style={{
        background: showColor ? t.bg : 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
        border: `1px solid ${showColor ? t.ring + '20' : '#e5e7eb'}`,
        borderRadius: 14,
        padding: '14px 16px',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: showColor ? t.ring : '#9ca3af',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
            boxShadow: showColor ? `0 2px 8px ${t.ring}40` : 'none',
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: showColor ? t.text : '#374151',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmt === 'money'
            ? '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : value.toLocaleString('zh-CN')}
        </span>
        {suffix && (
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{suffix}</span>
        )}
      </div>
    </div>
  )
}
