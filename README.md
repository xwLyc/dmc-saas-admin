# dmc-saas-admin

DMC 扫码系统 SaaS 后管 web —— **React + TypeScript + Tailwind + Vite**。

跟 [`dmc-saas-backend`](https://github.com/xwLyc/dmc-saas-backend) 通过 REST API 通信。

## 本地启动

```bash
# 1. 确保后端先起来(localhost:3001)
cd ../dmc-saas-backend && npm run dev

# 2. 这里装依赖 + 起 dev
npm install
npm run dev
```

后管跑在 http://localhost:5174,`/api` 自动代理到后端 3001。

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | React 18 + Vite 5 | 跟桌面端一致,开发体验好 |
| 语言 | TypeScript | 严格模式 |
| 样式 | Tailwind CSS 3 | 跟桌面端主题色对齐(紫色 accent) |
| 路由 | React Router 6 | 标准方案 |
| 状态 | Zustand | 跟桌面端一致,无 Redux 重 |
| 图标 | lucide-react | 跟桌面端一致 |

## 状态

| 阶段 | 状态 |
|---|---|
| Phase 0.7: 项目骨架 + 占位页 | ✅ |
| Phase 1: 后管业务模块 UI | ⏳ |
| Phase 2: 联调真 API + 部署 | ⏳ |

## 业务模块清单(Phase 1 填充)

跟 `dmc-scan-system/docs/saas/02-后管系统功能清单.md` v2.0 对齐:

- 工厂管理(列表/详情/邀请/调整/画像标签/资质档案)
- 订单与财务(订单流水/微信挂账审核/续费追踪)
- 推荐返佣(流水/排行/异常监控/规则)
- DMC 数据看板(首页/工厂下钻/品类/地区/异常)
- 业务协同(客户/出口订单/柜跟踪/报关合并导出)
- 系统运营(管理员账号/操作日志/公告/版本/短信日志)
