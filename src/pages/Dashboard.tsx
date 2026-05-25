/**
 * Admin Dashboard 数据看板 —— 首屏一次性渲染:
 *   - 顶部 9 项 KPI 卡片
 *   - 中段:近 12 月营收柱状图 + 新增工厂折线图
 *   - 下段:渠道分布饼图 + 转化漏斗 + 套餐分布饼图
 *   - 底部:即将到期工厂清单(7 天内 + 已过期 30 天内)
 *
 * 数据来自一个 endpoint: GET /admin/dashboard/stats (services/admin.getDashboardStats)
 */

import { useEffect, useState } from 'react'
import { history } from '@umijs/max'
import {
  Card, Row, Col, Spin, Empty, Tag, Tooltip, message,
  Typography,
} from 'antd'
import {
  ShopOutlined, RiseOutlined, ClockCircleOutlined, WarningOutlined,
  DollarOutlined, GiftOutlined, UserAddOutlined, CheckCircleOutlined, FallOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { AdminDashboardStats } from '@dmc/contracts'
import { getDashboardStats } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import RenewTenantModalButton from '@/components/RenewTenantModalButton'
import { KpiCard, COLORS } from '@/components/KpiCard'

// 统一 chart Card 样式(更软的圆角 + soft border)
const chartCardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid #e5e7eb',
}
const chartCardStyles = {
  header: { borderBottom: '1px solid #f3f4f6', fontWeight: 600 },
  body: { padding: 16 },
}

function fmtMoney(yuan: number) {
  return '¥ ' + yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtMonth(ym: string) {
  // 'YYYY-MM' → 'M月'
  const [, m] = ym.split('-')
  return `${parseInt(m, 10)}月`
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDashboardStats()
      .then((s) => { if (!cancelled) setStats(s) })
      .catch((e) => { if (!cancelled) message.error(getErrorMessage(e, '加载数据看板失败')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading && !stats) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="加载数据看板..." />
      </div>
    )
  }
  if (!stats) {
    return <Empty description="暂无数据" />
  }

  const { kpi, revenueByMonth, newTenantsByMonth, channelDistribution, conversionFunnel, planDistribution, expiringList } = stats

  // ─── 渠道 / 套餐 饼图数据 ───
  const channelData = [
    { name: '公司邀请', value: channelDistribution.company, color: COLORS.primary },
    { name: '推荐注册', value: channelDistribution.referral, color: COLORS.success },
  ]
  const planData = [
    { name: '月度订阅', value: planDistribution.monthly, color: COLORS.primary },
    { name: '年度订阅', value: planDistribution.yearly, color: COLORS.purple },
  ]

  // ─── 转化漏斗百分比 ───
  const subscribeRate = conversionFunnel.totalRegistered === 0 ? 0
    : Math.round((conversionFunnel.everSubscribed / conversionFunnel.totalRegistered) * 100)
  const activeRate = conversionFunnel.everSubscribed === 0 ? 0
    : Math.round((conversionFunnel.activeSubscribed / conversionFunnel.everSubscribed) * 100)

  return (
    <div>
      {/* ─── Tier 1: 9 KPI(现代 SaaS 风格,彩色 icon 块 + 渐变卡)─── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="slate" icon={<ShopOutlined />} label="累计工厂" value={kpi.totalTenants} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="success" icon={<CheckCircleOutlined />} label="活跃订阅" value={kpi.activeSubscriptions} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="primary" icon={<ClockCircleOutlined />} label="试用中" value={kpi.trialCount} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="warning" icon={<WarningOutlined />} label="即将到期 (7d)" value={kpi.expiringIn7Days} highlight={kpi.expiringIn7Days > 0} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="danger" icon={<FallOutlined />} label="已到期" value={kpi.expiredCount} highlight={kpi.expiredCount > 0} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="purple" icon={<UserAddOutlined />} label="本月新增" value={kpi.newTenantsThisMonth} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="gold" icon={<DollarOutlined />} label="本月营收" value={kpi.revenueThisMonth} fmt="money" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="success" icon={<RiseOutlined />} label="累计营收" value={kpi.revenueTotal} fmt="money" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={4}>
          <KpiCard tone="pink" icon={<GiftOutlined />} label="累计返佣天数" value={kpi.totalRewardDays} suffix="天" />
        </Col>
      </Row>

      {/* ─── Tier 2: 趋势图 ─── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="近 12 月营收 (元)" size="small" style={chartCardStyle} styles={chartCardStyles}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueByMonth} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={COLORS.success} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <RechartsTooltip
                  formatter={(value) => fmtMoney(Number(value))}
                  labelFormatter={(label) => `月份: ${label}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="value" fill="url(#grad-revenue)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="近 12 月新增工厂" size="small" style={chartCardStyle} styles={chartCardStyles}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={newTenantsByMonth} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-tenants" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <YAxis fontSize={11} stroke="#94a3b8" axisLine={false} tickLine={false} />
                <RechartsTooltip
                  formatter={(value) => `${value} 家`}
                  labelFormatter={(label) => `月份: ${label}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  cursor={{ stroke: '#e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={COLORS.primary}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#fff', stroke: COLORS.primary, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: COLORS.primary, stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* ─── Tier 3: 渠道分布 / 转化漏斗 / 套餐分布 ─── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card title="注册渠道分布" size="small" style={chartCardStyle} styles={chartCardStyles}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%" cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {channelData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value) => `${value} 家`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="转化漏斗" size="small" style={chartCardStyle} styles={chartCardStyles}>
            <div style={{ padding: '8px 0' }}>
              <FunnelStep
                label="总注册工厂"
                value={conversionFunnel.totalRegistered}
                color={COLORS.primary}
                width="100%"
              />
              <FunnelStep
                label="完成首次订阅"
                value={conversionFunnel.everSubscribed}
                color={COLORS.success}
                width={`${Math.max(subscribeRate, 10)}%`}
                rate={`${subscribeRate}%`}
              />
              <FunnelStep
                label="当前活跃订阅"
                value={conversionFunnel.activeSubscribed}
                color={COLORS.purple}
                width={`${Math.max(activeRate * subscribeRate / 100, 8)}%`}
                rate={`${activeRate}% × ${subscribeRate}%`}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="套餐分布(累计)" size="small" style={chartCardStyle} styles={chartCardStyles}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={planData}
                  cx="50%" cy="50%"
                  outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {planData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value) => `${value} 次`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* ─── Tier 4: 即将到期 / 已过期清单 ─── */}
      <Card
        title={
          <span>
            <WarningOutlined style={{ color: COLORS.warning, marginRight: 6 }} />
            即将到期 + 已过期 (近 30 天)
          </span>
        }
        size="small"
        style={chartCardStyle}
        styles={chartCardStyles}
        extra={
          <Tooltip title="点工厂跳到详情页处理">
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>共 {expiringList.length} 家</Typography.Text>
          </Tooltip>
        }
      >
        {expiringList.length === 0 ? (
          <Empty description="未来 7 天 + 已过期 30 天内 没有工厂" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {expiringList.map((t) => {
              const expired = t.daysLeft <= 0
              const urgent = t.daysLeft <= 3
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 4,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Link
                      onClick={() => history.push(`/tenants/${t.id}`)}
                      style={{ fontWeight: 500 }}
                    >
                      {t.name}
                    </Typography.Link>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {t.contactName} · {t.contactPhone}
                    </Typography.Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag color={expired ? 'red' : urgent ? 'orange' : 'blue'}>
                      {expired
                        ? `已过期 ${Math.abs(t.daysLeft)} 天`
                        : t.daysLeft === 0 ? '今日到期' : `还剩 ${t.daysLeft} 天`}
                    </Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(t.expiresAt).toLocaleDateString('zh-CN')}
                    </Typography.Text>
                    <RenewTenantModalButton
                      tenantId={t.id}
                      tenantName={t.name}
                      currentExpiresAt={t.expiresAt}
                      triggerText="续期"
                      triggerProps={{ size: 'small' }}
                      onSuccess={() => {
                        // 续期成功后从清单移除(本地优化,避免整页 refetch)
                        setStats((prev) => prev && ({
                          ...prev,
                          expiringList: prev.expiringList.filter((x) => x.id !== t.id),
                        }))
                      }}
                    />
                    <ArrowRightOutlined
                      style={{ color: '#bfbfbf', cursor: 'pointer' }}
                      onClick={() => history.push(`/tenants/${t.id}`)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

// KpiCard / KPI_TONE / ColorKey 已抽到 @/components/KpiCard,供 Subscriptions 等页面共用

// ─── 转化漏斗单条 step ───

function FunnelStep({
  label, value, color, width, rate,
}: {
  label: string
  value: number
  color: string
  width: string
  rate?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <span style={{ color: '#666' }}>{label}</span>
        <span style={{ color }}>
          <strong>{value}</strong>
          {rate && <span style={{ color: '#999', marginLeft: 6, fontSize: 11 }}>{rate}</span>}
        </span>
      </div>
      <div
        style={{
          width,
          height: 24,
          background: color,
          opacity: 0.85,
          borderRadius: 4,
          transition: 'width 0.4s',
        }}
      />
    </div>
  )
}
