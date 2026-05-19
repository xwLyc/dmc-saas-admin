/**
 * /tenants —— Linear Dark 严格 token 版工厂列表
 *
 * - 顶部 toolbar 一行：标题 / 总数 / 搜索 / 刷新
 * - 状态 tabs 单独一行（pill 风，无渐变）
 * - 表格行高 40px，状态徽章带圆点
 * - 分页内联底部
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Search, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminApi } from '../api/admin.api'
import { isApiError } from '../lib/http'
import { cn } from '../lib/cn'
import type {
  AdminListTenantsResponse,
  AdminTenantRow,
  TenantStatus,
} from '@dmc/contracts'

const PAGE_SIZE = 20

const STATUS_FILTERS: { value: TenantStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'trial', label: '试用中' },
  { value: 'active', label: '订阅中' },
  { value: 'expired', label: '已到期' },
  { value: 'disabled', label: '已停用' },
]

const STATUS_META: Record<TenantStatus, { label: string; cls: string }> = {
  trial: { label: '试用中', cls: 'badge-info' },
  active: { label: '订阅中', cls: 'badge-success' },
  expired: { label: '已到期', cls: 'badge-warning' },
  disabled: { label: '已停用', cls: 'badge-danger' },
}

export default function TenantsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TenantStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminListTenantsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTenants = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await adminApi.listTenants({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setData(resp)
    } catch (err) {
      setError(isApiError(err) ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTenants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchTenants()
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      }}
    >
      {/* 标题 + Toolbar 一行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            color: 'var(--text-primary)',
            letterSpacing: -0.2,
          }}
        >
          工厂管理
        </h1>
        {data && (
          <span
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
            }}
          >
            {data.total} 家
          </span>
        )}

        <form
          onSubmit={handleSearchSubmit}
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ position: 'relative', width: 280 }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工厂名 / 联系人 / 手机号"
              className="glass-input"
              style={{ paddingLeft: 32 }}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            搜索
          </button>
          <button
            type="button"
            className="btn-icon"
            onClick={fetchTenants}
            disabled={loading}
            title="刷新"
            aria-label="刷新"
          >
            <RotateCw size={14} />
          </button>
        </form>
      </div>

      {/* Status filter tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.value
          return (
            <button
              key={f.value}
              onClick={() => {
                setStatusFilter(f.value)
                setPage(1)
              }}
              style={{
                fontSize: 13,
                padding: '0 12px',
                height: 32,
                borderRadius: 6,
                background: active ? 'var(--bg-hover)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: active ? 'var(--border-strong)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.10s ease, color 0.10s ease',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Table + Pagination card */}
      <div
        className="glass-panel"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {error && (
          <div
            style={{
              padding: 12,
              color: 'var(--danger)',
              background: 'var(--danger-bg)',
              fontSize: 13,
              borderBottom: '1px solid var(--border-default)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>工厂名</th>
                <th>联系人</th>
                <th>手机号</th>
                <th>地区</th>
                <th>状态</th>
                <th>渠道</th>
                <th>推荐码</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="empty-row">
                    加载中…
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-row">
                    暂无工厂
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => <TenantRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {data && (
          <div
            style={{
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              borderTop: '1px solid var(--border-default)',
              background: 'var(--bg-card)',
              flexShrink: 0,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              第 {page} / {totalPages} 页 · 共 {data.total} 家
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn-icon"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="上一页"
                aria-label="上一页"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn-icon"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title="下一页"
                aria-label="下一页"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TenantRow({ row }: { row: AdminTenantRow }) {
  const status = STATUS_META[row.status]
  return (
    <tr className="row-hover">
      <td>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          {row.name}
        </span>
      </td>
      <td style={{ color: 'var(--text-secondary)' }}>{row.contactName}</td>
      <td
        style={{
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          color: 'var(--text-secondary)',
        }}
      >
        {row.contactPhone}
      </td>
      <td style={{ color: 'var(--text-secondary)' }}>
        {row.region ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td>
        <span className={cn('badge', status.cls)}>{status.label}</span>
      </td>
      <td>
        <span
          className={cn(
            'badge',
            row.invitedBy === 'company' ? 'badge-muted' : 'badge-info',
          )}
        >
          {row.invitedBy === 'company' ? '公司' : '推荐'}
        </span>
      </td>
      <td
        style={{
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          color: 'var(--text-secondary)',
          fontSize: 12,
        }}
      >
        {row.referralCode}
      </td>
      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {new Date(row.createdAt).toLocaleString('zh-CN', {
          hour12: false,
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
    </tr>
  )
}
