import { defineConfig } from '@umijs/max'

export default defineConfig({
  npmClient: 'npm',

  // dev server port 用 PORT env var(在 package.json 的 dev script 设 PORT=5174)
  // 跟桌面端 5173 错开,跟 backend CORS allow list 一致(backend allow 5173,5174)

  // dev 时 /api/* 代理到 backend(避 CORS),prod 部署改后端 allow origin
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
    },
  },

  // 插件
  antd: {},
  request: {},
  initialState: {},
  model: {},
  // ProLayout 自动包裹路由,不需要单独写 layouts/
  layout: {
    title: 'DMC 后管',
    locale: false,
  },

  // 在 <head> 最早 inject 一段 inline script,patch console.warn/error 静默
  // 已知的 antd / rc-* / React 18 deprecated warning。
  // - findDOMNode is deprecated (rc-resize-observer / rc-tooltip 内部)
  // - antd 5.22+ destroyOnClose → destroyOnHidden 过渡 warning
  // 都是库自己的事,不影响功能,prod build 也不会有。等 antd 6 / rc-* 迁移完
  // 可以删本段。
  headScripts: [
    {
      content: `
(function() {
  if (typeof window === 'undefined') return;
  var SUPPRESSED = ['findDOMNode is deprecated', 'destroyOnClose'];
  function shouldSuppress(args) {
    var msg = args[0];
    if (typeof msg !== 'string') return false;
    for (var i = 0; i < SUPPRESSED.length; i++) {
      if (msg.indexOf(SUPPRESSED[i]) !== -1) return true;
    }
    return false;
  }
  var origWarn = console.warn;
  console.warn = function() {
    if (!shouldSuppress(arguments)) origWarn.apply(console, arguments);
  };
  var origError = console.error;
  console.error = function() {
    if (!shouldSuppress(arguments)) origError.apply(console, arguments);
  };
})();
      `.trim(),
    },
  ],

  routes: [
    { path: '/login', layout: false, component: '@/pages/Login' },
    { path: '/', redirect: '/dashboard' },
    {
      path: '/dashboard',
      component: '@/pages/Dashboard',
      name: '数据看板',
      icon: 'DashboardOutlined',
    },
    {
      path: '/tenants',
      component: '@/pages/Tenants',
      name: '工厂管理',
      icon: 'ShopOutlined',
    },
    {
      path: '/tenants/:id',
      component: '@/pages/TenantDetail',
      name: '工厂详情',
      hideInMenu: true,
    },
    {
      path: '/audit-logs',
      component: '@/pages/AuditLogs',
      name: '操作记录',
      icon: 'FileTextOutlined',
    },
  ],
})
