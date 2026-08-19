/**
 * KpiCard —— 数据看板顶部 KPI 块,共享组件。
 *
 * 视觉:白色运营卡 + 顶部状态线 + 低饱和彩色 icon，跟后管工作区统一。
 * Dashboard 等页面共用,保证 KPI 视觉节奏一致。
 */

import type { ReactNode } from 'react'

// 现代 SaaS 看板色板(Tailwind 风格,比 antd 默认更柔和)
export const COLORS = {
  primary: '#316eea',
  success: '#0f9f78',
  warning: '#e79a18',
  danger: '#dc4c64',
  purple: '#7565d6',
  cyan: '#24aeca',
  pink: '#d75a91',
  gold: '#c89318',
  slate: '#627089',
}

export type ColorKey = keyof typeof COLORS

export const KPI_TONE: Record<ColorKey, { soft: string; ring: string; text: string }> = {
  primary: { soft: '#edf3ff', ring: '#316eea', text: '#2456bb' },
  success: { soft: '#eaf8f4', ring: '#0f9f78', text: '#087458' },
  warning: { soft: '#fff6e6', ring: '#e79a18', text: '#aa6b08' },
  danger: { soft: '#fff0f3', ring: '#dc4c64', text: '#af3048' },
  purple: { soft: '#f2efff', ring: '#7565d6', text: '#5746b2' },
  cyan: { soft: '#eaf9fc', ring: '#24aeca', text: '#177e94' },
  pink: { soft: '#fff0f6', ring: '#d75a91', text: '#a93669' },
  gold: { soft: '#fff7e2', ring: '#c89318', text: '#966c0b' },
  slate: { soft: '#f0f3f7', ring: '#627089', text: '#435069' },
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

export function KpiCard({
  tone,
  icon,
  label,
  value,
  fmt = 'plain',
  highlight = false,
  suffix,
}: KpiCardProps) {
  const t = KPI_TONE[tone]
  const showColor = !highlight || value > 0
  return (
    <div
      style={{
        background: showColor
          ? `linear-gradient(90deg, ${t.ring} 0 36%, transparent 36%) top / 100% 2px no-repeat, #fff`
          : '#fff',
        border: '1px solid #e2e9f2',
        borderRadius: 14,
        padding: '15px 16px 16px',
        boxShadow: '0 8px 24px rgba(22, 45, 82, 0.05)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 28px rgba(22,45,82,0.10)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: showColor ? t.soft : '#f0f3f7',
            color: showColor ? t.ring : '#8793a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            border: `1px solid ${showColor ? t.ring + '18' : '#e1e6ed'}`,
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: 11, color: '#718096', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: showColor && highlight ? t.text : '#172641',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmt === 'money'
            ? '¥' +
              value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : value.toLocaleString('zh-CN')}
        </span>
        {suffix && (
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{suffix}</span>
        )}
      </div>
    </div>
  )
}
