/**
 * 后管登录页 —— Linear Dark 严格 token 版
 *
 * - 居中卡片 320px width，无装饰
 * - 错误提示 inline flash（非浮岛动画）
 * - dev 模式预填 admin/admin123
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../api/admin.api'
import { useAuthStore } from '../store/auth.store'
import { isApiError } from '../lib/http'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const isDev = (import.meta as any).env?.DEV === true
  const [username, setUsername] = useState(isDev ? 'admin' : '')
  const [password, setPassword] = useState(isDev ? 'admin123' : '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canSubmit =
    username.trim().length >= 3 && password.length >= 1 && !loading

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)
    try {
      const result = await adminApi.login({
        username: username.trim(),
        password,
      })
      setAuth(result.admin)
      navigate('/tenants', { replace: true })
    } catch (err) {
      setError(isApiError(err) ? err.message : '登录失败,请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: 320,
          padding: 32,
        }}
      >
        {/* 标题区 —— 纯文字,无 icon container */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: -0.2,
            }}
          >
            DMC 后管
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            管理员登录
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="glass-input"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="glass-input"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div
              style={{
                padding: 12,
                fontSize: 13,
                color: 'var(--danger)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary"
            style={{ marginTop: 8, width: '100%' }}
          >
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        {isDev && (
          <div
            style={{
              marginTop: 24,
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            dev 默认: admin / admin123
          </div>
        )}
      </div>
    </div>
  )
}
