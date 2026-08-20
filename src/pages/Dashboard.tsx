/**
 * Admin Dashboard 数据看板
 *
 * 信息层级按运营判断顺序组织：
 *   1. 选择统计周期
 *   2. 判断本期增长与当前订阅规模
 *   3. 优先处理续期风险
 *   4. 分析趋势、渠道和套餐结构
 */

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { history } from '@umijs/max'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Progress,
  Row,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FallOutlined,
  GiftOutlined,
  LoadingOutlined,
  RiseOutlined,
  ShopOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AdminDashboardStats } from '@dmc/contracts'
import { getDashboardStats } from '@/services/admin'
import { getErrorMessage } from '@/lib/errorMsg'
import RenewTenantModalButton from '@/components/RenewTenantModalButton'
import { COLORS } from '@/components/KpiCard'
import styles from './Dashboard.module.less'

function fmtMoney(yuan: number) {
  return `¥${yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtMonth(ym: string) {
  const [, month] = ym.split('-')
  return `${parseInt(month, 10)}月`
}

type RangePreset =
  | 'today'
  | 'last-7d'
  | 'last-30d'
  | 'this-month'
  | 'last-month'
  | 'last-12m'
  | 'custom'

interface DateRange {
  from: Dayjs
  to: Dayjs
  preset: RangePreset
  label: string
}

function computeRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const now = dayjs()
  switch (preset) {
    case 'today':
      return { from: now.startOf('day'), to: now.endOf('day'), preset, label: '今天' }
    case 'last-7d':
      return {
        from: now.subtract(6, 'day').startOf('day'),
        to: now.endOf('day'),
        preset,
        label: '近 7 天',
      }
    case 'last-30d':
      return {
        from: now.subtract(29, 'day').startOf('day'),
        to: now.endOf('day'),
        preset,
        label: '近 30 天',
      }
    case 'this-month':
      return { from: now.startOf('month'), to: now.endOf('day'), preset, label: '本月' }
    case 'last-month': {
      const lastMonth = now.subtract(1, 'month')
      return {
        from: lastMonth.startOf('month'),
        to: lastMonth.endOf('month'),
        preset,
        label: '上月',
      }
    }
    case 'last-12m':
      return {
        from: now.subtract(11, 'month').startOf('month'),
        to: now.endOf('day'),
        preset,
        label: '近 12 月',
      }
  }
}

const PRESET_OPTIONS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'last-7d', label: '近 7 天' },
  { key: 'last-30d', label: '近 30 天' },
  { key: 'this-month', label: '本月' },
  { key: 'last-month', label: '上月' },
  { key: 'last-12m', label: '近 12 月' },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month'))

  const rangeDays = useMemo(() => Math.max(1, range.to.diff(range.from, 'day') + 1), [range])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDashboardStats({ from: range.from.toISOString(), to: range.to.toISOString() })
      .then((nextStats) => {
        if (!cancelled) setStats(nextStats)
      })
      .catch((error) => {
        if (!cancelled) message.error(getErrorMessage(error, '加载数据看板失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (loading && !stats) {
    return (
      <div className={styles.loadingState}>
        <Spin size="large" />
        <strong>正在汇总经营数据</strong>
        <span>加载工厂、订阅与营收信息…</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className={styles.emptyState}>
        <Empty description="暂无数据" />
      </div>
    )
  }

  const {
    kpi,
    revenueByMonth,
    newTenantsByMonth,
    channelDistribution,
    conversionFunnel,
    planDistribution,
    expiringList,
  } = stats

  const channelData = [
    { name: '公司邀请', value: channelDistribution.company, color: COLORS.primary },
    { name: '推荐注册', value: channelDistribution.referral, color: COLORS.success },
  ]
  const planData = [
    { name: '月度订阅', value: planDistribution.monthly, color: COLORS.primary },
    { name: '年度订阅', value: planDistribution.yearly, color: COLORS.purple },
  ]

  const subscribeRate = conversionFunnel.totalRegistered
    ? Math.round((conversionFunnel.everSubscribed / conversionFunnel.totalRegistered) * 100)
    : 0
  const activeRate = conversionFunnel.everSubscribed
    ? Math.round((conversionFunnel.activeSubscribed / conversionFunnel.everSubscribed) * 100)
    : 0
  const activeCoverage = kpi.totalTenants
    ? Math.round((kpi.activeSubscriptions / kpi.totalTenants) * 100)
    : 0
  const renewalRiskCount = kpi.expiringIn7Days + kpi.expiredCount
  const visibleExpiringList = expiringList.slice(0, 6)

  return (
    <main className={styles.dashboard}>
      <section className={styles.controlDeck}>
        <div className={styles.rangeControl}>
          <div className={styles.rangeLabel}>
            <CalendarOutlined />
            <span>统计周期</span>
          </div>
          <div className={styles.presetGroup} aria-label="统计周期预设">
            {PRESET_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={range.preset === option.key ? styles.presetActive : undefined}
                aria-pressed={range.preset === option.key}
                onClick={() => setRange(computeRange(option.key))}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={styles.datePickerWrap}>
            <DatePicker.RangePicker
              className={styles.datePicker}
              value={[range.from, range.to]}
              allowClear={false}
              format="YYYY-MM-DD"
              onChange={(values) => {
                if (!values || !values[0] || !values[1]) return
                const from = values[0].startOf('day')
                const to = values[1].endOf('day')
                const days = to.diff(from, 'day') + 1
                setRange({ from, to, preset: 'custom', label: `自定义 · ${days} 天` })
              }}
              placeholder={['开始日期', '结束日期']}
            />
          </div>
          <div className={styles.rangeSummary}>
            <span>{range.label}</span>
            <strong>{rangeDays} 天</strong>
          </div>
          <div
            className={`${styles.riskSignal} ${
              renewalRiskCount > 0 ? styles.riskSignalWarning : styles.riskSignalHealthy
            }`}
          >
            <div className={styles.riskIcon}>
              {renewalRiskCount > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
            </div>
            <div>
              <span>续期关注</span>
              <strong>
                {renewalRiskCount > 0 ? `${renewalRiskCount} 家待处理` : '当前状态健康'}
              </strong>
            </div>
          </div>
          <span className={styles.loadingSlot} aria-live="polite">
            {loading && (
              <Tooltip title="正在更新当前周期数据">
                <LoadingOutlined className={styles.loadingIcon} spin />
              </Tooltip>
            )}
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          eyebrow="CURRENT PERIOD"
          title="本期经营"
          description={`${range.from.format('YYYY.MM.DD')} — ${range.to.format(
            'YYYY.MM.DD',
          )} 的核心结果`}
        />
        <div className={styles.primaryMetrics}>
          <PrimaryMetric
            tone="blue"
            icon={<DollarOutlined />}
            label="本期营收"
            value={fmtMoney(kpi.revenueInRange)}
            helper="统计周期内已入账金额"
          />
          <PrimaryMetric
            tone="cyan"
            icon={<UserAddOutlined />}
            label="新增工厂"
            value={kpi.newTenantsInRange.toLocaleString('zh-CN')}
            suffix="家"
            helper="统计周期内新注册工厂"
          />
          <PrimaryMetric
            tone="green"
            icon={<CheckCircleOutlined />}
            label="活跃订阅"
            value={kpi.activeSubscriptions.toLocaleString('zh-CN')}
            suffix="家"
            helper={`占全部工厂 ${activeCoverage}%`}
          />
        </div>
        <div className={styles.lifetimeStrip}>
          <ContextMetric
            icon={<ShopOutlined />}
            label="累计工厂"
            value={`${kpi.totalTenants.toLocaleString('zh-CN')} 家`}
          />
          <ContextMetric
            icon={<RiseOutlined />}
            label="累计营收"
            value={fmtMoney(kpi.revenueTotal)}
          />
          <ContextMetric
            icon={<GiftOutlined />}
            label="累计返佣"
            value={`${kpi.totalRewardDays.toLocaleString('zh-CN')} 天`}
          />
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading
          eyebrow="ACTION QUEUE"
          title="订阅健康与待办"
          description="先处理即将到期和已过期工厂，再关注试用转化"
        />
        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} xl={9}>
            <Card className={`${styles.panelCard} ${styles.healthCard}`}>
              <PanelTitle title="订阅健康" description="当前全量工厂状态" />
              <div className={styles.coverageBlock}>
                <div>
                  <span>活跃订阅覆盖</span>
                  <strong>{activeCoverage}%</strong>
                </div>
                <Progress
                  percent={activeCoverage}
                  showInfo={false}
                  strokeColor={{ '0%': '#316eea', '100%': '#5fd6f2' }}
                  trailColor="#eaf0f7"
                  size={{ height: 8 }}
                />
              </div>
              <div className={styles.healthGrid}>
                <HealthMetric
                  tone="neutral"
                  icon={<ShopOutlined />}
                  label="全部工厂"
                  value={kpi.totalTenants}
                />
                <HealthMetric
                  tone="info"
                  icon={<ClockCircleOutlined />}
                  label="试用中"
                  value={kpi.trialCount}
                />
                <HealthMetric
                  tone="warning"
                  icon={<WarningOutlined />}
                  label="7 天内到期"
                  value={kpi.expiringIn7Days}
                />
                <HealthMetric
                  tone="danger"
                  icon={<FallOutlined />}
                  label="已到期"
                  value={kpi.expiredCount}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} xl={15}>
            <Card
              className={`${styles.panelCard} ${styles.actionCard}`}
              title={<PanelTitle title="续期待办" description="未来 7 天到期及近 30 天已过期" />}
              extra={<span className={styles.queueCount}>{expiringList.length} 家</span>}
            >
              {visibleExpiringList.length === 0 ? (
                <div className={styles.queueEmpty}>
                  <CheckCircleOutlined />
                  <div>
                    <strong>当前没有续期待办</strong>
                    <span>未来 7 天内没有即将到期的工厂</span>
                  </div>
                </div>
              ) : (
                <div className={styles.renewalList}>
                  {visibleExpiringList.map((tenant) => {
                    const expired = tenant.daysLeft < 0
                    const urgent = tenant.daysLeft <= 3
                    return (
                      <div className={styles.renewalItem} key={tenant.id}>
                        <button
                          type="button"
                          className={styles.tenantIdentity}
                          onClick={() => history.push(`/tenants/${tenant.id}`)}
                        >
                          <span className={styles.tenantMark}>{tenant.name.slice(0, 1)}</span>
                          <span>
                            <strong>{tenant.name}</strong>
                            <small>
                              {tenant.contactName} · {tenant.contactPhone}
                            </small>
                          </span>
                        </button>
                        <div className={styles.renewalMeta}>
                          <Tag color={expired ? 'red' : urgent ? 'orange' : 'blue'}>
                            {expired
                              ? `已过期 ${Math.abs(tenant.daysLeft)} 天`
                              : tenant.daysLeft === 0
                                ? '今日到期'
                                : `还剩 ${tenant.daysLeft} 天`}
                          </Tag>
                          <time>{dayjs(tenant.expiresAt).format('YYYY.MM.DD')}</time>
                          <RenewTenantModalButton
                            tenantId={tenant.id}
                            tenantName={tenant.name}
                            currentExpiresAt={tenant.expiresAt}
                            triggerText="续期"
                            triggerProps={{ size: 'small' }}
                            onSuccess={() => {
                              setStats(
                                (previous) =>
                                  previous && {
                                    ...previous,
                                    expiringList: previous.expiringList.filter(
                                      (item) => item.id !== tenant.id,
                                    ),
                                  },
                              )
                            }}
                          />
                          <ArrowRightOutlined
                            className={styles.rowArrow}
                            onClick={() => history.push(`/tenants/${tenant.id}`)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {expiringList.length > visibleExpiringList.length && (
                <Button
                  type="link"
                  className={styles.viewAllButton}
                  onClick={() => history.push('/tenants')}
                >
                  查看全部待处理工厂 <ArrowRightOutlined />
                </Button>
              )}
            </Card>
          </Col>
        </Row>
      </section>

      <section className={styles.section}>
        <SectionHeading
          eyebrow="PERFORMANCE"
          title="增长趋势"
          description="对照营收与新增工厂，判断增长质量"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              className={styles.panelCard}
              title={<PanelTitle title="营收趋势" description="按月汇总入账金额" />}
              extra={<span className={styles.panelPeriod}>{range.label}</span>}
            >
              <ResponsiveContainer width="100%" height={278}>
                <BarChart data={revenueByMonth} margin={{ top: 18, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashboard-revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#316eea" stopOpacity={0.96} />
                      <stop offset="100%" stopColor="#5f98f5" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="#eaf0f6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    fontSize={11}
                    stroke="#91a0b5"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis fontSize={11} stroke="#91a0b5" axisLine={false} tickLine={false} />
                  <RechartsTooltip
                    formatter={(value) => fmtMoney(Number(value))}
                    labelFormatter={(label) => `${label}`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ fill: '#f3f7fd' }}
                  />
                  <Bar dataKey="value" fill="url(#dashboard-revenue)" radius={[6, 6, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card
              className={styles.panelCard}
              title={<PanelTitle title="新增工厂趋势" description="按月统计新注册工厂" />}
              extra={<span className={styles.panelPeriod}>{range.label}</span>}
            >
              <ResponsiveContainer width="100%" height={278}>
                <LineChart
                  data={newTenantsByMonth}
                  margin={{ top: 18, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 4" stroke="#eaf0f6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={fmtMonth}
                    fontSize={11}
                    stroke="#91a0b5"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    stroke="#91a0b5"
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    formatter={(value) => `${value} 家`}
                    labelFormatter={(label) => `${label}`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ stroke: '#d7e3f3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={COLORS.success}
                    strokeWidth={3}
                    dot={{ r: 3, fill: '#fff', stroke: COLORS.success, strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: COLORS.success, stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </Col>
        </Row>
      </section>

      <section className={styles.section}>
        <SectionHeading
          eyebrow="BUSINESS MIX"
          title="业务结构"
          description="从获客、转化与套餐偏好理解增长来源"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <DistributionCard
              title="注册渠道"
              description="工厂从哪里进入系统"
              data={channelData}
              unit="家"
            />
          </Col>
          <Col xs={24} md={8}>
            <Card className={`${styles.panelCard} ${styles.mixCard}`}>
              <PanelTitle title="订阅转化" description="注册到活跃订阅的转化链路" />
              <div className={styles.funnelSummary}>
                <strong>{subscribeRate}%</strong>
                <span>注册工厂完成过首次订阅</span>
              </div>
              <div className={styles.funnelList}>
                <FunnelStep
                  label="注册工厂"
                  value={conversionFunnel.totalRegistered}
                  rate="基准"
                  percent={100}
                  color={COLORS.primary}
                />
                <FunnelStep
                  label="完成首次订阅"
                  value={conversionFunnel.everSubscribed}
                  rate={`${subscribeRate}%`}
                  percent={subscribeRate}
                  color={COLORS.success}
                />
                <FunnelStep
                  label="当前活跃订阅"
                  value={conversionFunnel.activeSubscribed}
                  rate={`${activeRate}% 留存`}
                  percent={
                    conversionFunnel.totalRegistered
                      ? Math.round(
                          (conversionFunnel.activeSubscribed / conversionFunnel.totalRegistered) *
                            100,
                        )
                      : 0
                  }
                  color={COLORS.purple}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <DistributionCard
              title="套餐选择"
              description="累计订阅中的套餐偏好"
              data={planData}
              unit="次"
            />
          </Col>
        </Row>
      </section>
    </main>
  )
}

const CHART_TOOLTIP_STYLE = {
  border: '1px solid #dfe7f1',
  borderRadius: 10,
  boxShadow: '0 12px 28px rgba(23, 43, 77, 0.12)',
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  )
}

function PanelTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className={styles.panelTitle}>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

function PrimaryMetric({
  tone,
  icon,
  label,
  value,
  suffix,
  helper,
}: {
  tone: 'blue' | 'cyan' | 'green'
  icon: ReactNode
  label: string
  value: string
  suffix?: string
  helper: string
}) {
  return (
    <article className={`${styles.primaryMetric} ${styles[`primaryMetric${tone}`]}`}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricBody}>
        <span className={styles.metricLabel}>{label}</span>
        <div className={styles.metricValue}>
          <strong>{value}</strong>
          {suffix && <span>{suffix}</span>}
        </div>
        <small>{helper}</small>
      </div>
    </article>
  )
}

function ContextMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className={styles.contextMetric}>
      <span className={styles.contextIcon}>{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  )
}

function HealthMetric({
  tone,
  icon,
  label,
  value,
}: {
  tone: 'neutral' | 'info' | 'warning' | 'danger'
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <div className={`${styles.healthMetric} ${styles[`healthMetric${tone}`]}`}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value.toLocaleString('zh-CN')}</strong>
    </div>
  )
}

function DistributionCard({
  title,
  description,
  data,
  unit,
}: {
  title: string
  description: string
  data: { name: string; value: number; color: string }[]
  unit: string
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <Card className={`${styles.panelCard} ${styles.mixCard}`}>
      <PanelTitle title={title} description={description} />
      <div className={styles.donutWrap}>
        <ResponsiveContainer width="100%" height={176}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <RechartsTooltip formatter={(value) => `${value} ${unit}`} />
            <Legend iconType="circle" iconSize={7} />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.donutTotal}>
          <strong>{total.toLocaleString('zh-CN')}</strong>
          <span>{unit}</span>
        </div>
      </div>
    </Card>
  )
}

function FunnelStep({
  label,
  value,
  rate,
  percent,
  color,
}: {
  label: string
  value: number
  rate: string
  percent: number
  color: string
}) {
  return (
    <div className={styles.funnelStep}>
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString('zh-CN')}</strong>
        <small>{rate}</small>
      </div>
      <div className={styles.funnelTrack}>
        <span style={{ width: `${Math.max(percent, 3)}%`, background: color }} />
      </div>
    </div>
  )
}
