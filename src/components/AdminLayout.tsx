/**
 * AdminLayout —— Linear Dark 严格 token 版
 *
 * - sidebar 200px,nav 链接用 .nav-link class
 * - topbar 高度 48px,内含 theme switcher + 用户名 + 退出
 * - 主内容 padding 16,gap 由子页面控
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { Building2, LogOut, Palette, Check } from 'lucide-react'
import { useAuth, useAuthStore } from '../store/auth.store'
import { useThemeStore, THEMES } from '../store/theme.store'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const NAV: NavItem[] = [
  { to: '/tenants', label: '工厂管理', icon: <Building2 size={14} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <Topbar />
        <main
          style={{
            flex: 1,
            minWidth: 0,
            padding: 16,
            paddingTop: 0,
            overflowY: 'auto',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <aside
      style={{
        width: 200,
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border-default)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      {/* Logo:纯文字,无 icon container */}
      <div
        style={{
          padding: '8px 12px 16px 12px',
          borderBottom: '1px solid var(--border-default)',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: -0.2,
          }}
        >
          DMC
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          SaaS Admin
        </div>
      </div>

      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </aside>
  )
}

function Topbar() {
  const navigate = useNavigate()
  const { admin } = useAuth()
  const logoutStore = useAuthStore((s) => s.logout)

  const handleLogout = () => {
    logoutStore()
    navigate('/login', { replace: true })
  }

  return (
    <header
      style={{
        padding: 16,
        paddingBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        height: 48 + 12 + 16,
      }}
    >
      <div
        style={{
          height: 32,
          padding: '0 12px',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 6,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        {admin?.name ?? admin?.username ?? 'guest'}
      </div>
      <button
        onClick={handleLogout}
        className="btn-icon"
        title="退出登录"
        aria-label="退出登录"
      >
        <LogOut size={14} />
      </button>
    </header>
  )
}

function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 0,
  })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        className="btn-icon"
        title="主题"
        aria-label="切换主题"
        onClick={() => setOpen((o) => !o)}
      >
        <Palette size={14} />
      </button>

      {open
        && createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
              minWidth: 200,
              padding: 4,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {THEMES.map((t) => {
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id)
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 8,
                    borderRadius: 4,
                    background: active ? 'var(--bg-hover)' : 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 0.10s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      (e.currentTarget as HTMLElement).style.background =
                        'transparent'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{t.name}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 4,
                      }}
                    >
                      {t.desc}
                    </div>
                  </div>
                  {active && (
                    <Check size={13} style={{ color: 'var(--accent)' }} />
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
