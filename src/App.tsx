/**
 * DMC SaaS 后管入口 —— 路由 + AuthGuard。
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import AuthGuard, { useAuthHydration } from './components/AuthGuard'
import AdminLayout from './components/AdminLayout'
import LoginPage from './pages/LoginPage'
import TenantsPage from './pages/TenantsPage'

export default function App() {
  useAuthHydration()

  return (
    <AuthGuard>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/tenants"
          element={
            <AdminLayout>
              <TenantsPage />
            </AdminLayout>
          }
        />
        {/* 后续 phase 加更多业务路由,默认 /tenants */}
        <Route path="/" element={<Navigate to="/tenants" replace />} />
        <Route path="*" element={<Navigate to="/tenants" replace />} />
      </Routes>
    </AuthGuard>
  )
}
