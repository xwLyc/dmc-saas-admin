# dmc-saas-admin — Claude 指引

DMC SaaS 后管前端 — Vite + React + TypeScript + Tailwind + zustand + react-router-dom。
**我公司自己用**的后台管理 web，管理所有工厂租户、订单、返佣、数据看板。

## 三端架构定位

| repo | 角色 |
|---|---|
| **dmc-saas-admin**（本 repo） | 后管 web,我公司用 |
| dmc-saas-backend | 云后端,提供 HTTP API |
| dmc-scan-system | Electron 桌面端,工厂装机使用 |
| dmc-saas-contracts | 三端共享 Zod schema 单一来源 |

四个 repo 平级放在 `/Users/adufood/Documents/Claude/Projects/` 下。

## 当前阶段

Phase 0.7 后管前端骨架(Vite + React + TS + Tailwind)已搭,**功能页未写**。
按 `docs/saas/02-后管系统功能清单.md` v2.0 推进,**单角色管理员**,MVP 只 1 个 seed 账号。

## API 契约 — 强约束 ★

**所有调用 backend 的请求/响应类型必须从 `@dmc/contracts` import,禁止在本 repo 重新定义。**

```ts
// ✅ 正确
import { TenantProfile, PaginationQuery } from '@dmc/contracts'

export async function listTenants(query: PaginationQuery): Promise<TenantProfile[]> {
  const res = await fetch(`${API_BASE}/admin/tenants?${qs.stringify(query)}`)
  return z.array(TenantProfile).parse(await res.json())
}

// ❌ 错误
interface TenantInfo { id: string; name: string; ... }
```

**发现 schema 不够用** → 去 `dmc-saas-contracts` 加,**不在本 repo 临时定义**。

**注意**:后管专用的 API(管理员视角的 tenant 列表 / 订单审批 / 后管账号)目前在 contracts 里**还没定义** —— 这是下一步要补的。
等 backend 把后管 API 设计稿对齐后,把对应 schema 加进 `dmc-saas-contracts/src/admin/` 子目录(待建)。

## 本地开发期接 @dmc/contracts

```json
// package.json
{
  "dependencies": {
    "@dmc/contracts": "file:../dmc-saas-contracts",
    "zod": "^3.23.8"
  }
}
```

zod 是 contracts 的 `peerDependency`,需要在本 repo 显式装一份。

## 路由组织

```
src/
  pages/
    tenants/          §2 工厂管理
    orders/           §3 订单与财务
    referrals/        §4 推荐返佣
    dashboard/        §5 DMC 数据看板 ★
    business/         §6 业务协同(俄罗斯客户/出口订单/集装箱跟踪)
    system/           §7 系统运营(管理员/操作日志/公告/版本管理/短信记录)
    login/            登录页(单一管理员账号)
  components/         通用组件
  api/                按域分文件: tenants.ts / orders.ts / referrals.ts ...
  store/              zustand stores
```

## 长期工程偏好

- Tailwind 优先,自定义 CSS 仅用于 utility 不够的场景
- zustand 用于全局状态(登录态/用户信息),组件本地状态用 useState
- 表格 / 列表使用虚拟滚动(后管动辄几千条工厂记录)
- 所有 fetch 走统一封装,自动注入 JWT + 401 跳登录
- 数据看板优先用现有图表库(echarts / recharts),不自己造轮子
