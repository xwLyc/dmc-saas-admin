/**
 * DMC SaaS 后管入口组件 —— Phase 0.7 阶段只有占位页 + 基础路由结构。
 *
 * 后续 Phase 1 agent 在 src/routes/ 加业务模块:
 *   /login           登录(对接后端 /auth/login)
 *   /                工厂管理(列表/详情/邀请)
 *   /orders          订单与财务
 *   /referrals       推荐返佣
 *   /dashboard       DMC 数据看板
 *   /sync            业务协同
 *   /system          系统运营
 */

import { Routes, Route, Navigate } from 'react-router-dom'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PlaceholderPage title="DMC SaaS 后管" />} />
      <Route path="/login" element={<PlaceholderPage title="登录" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="text-sm text-slate-500">
          Phase 0.7 占位页 — Phase 1 agent 将填充业务模块
        </p>
      </div>
    </div>
  )
}
