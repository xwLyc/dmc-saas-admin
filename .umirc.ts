import { defineConfig } from '@umijs/max'

export default defineConfig({
  npmClient: 'npm',

  // 生产部署在共用服务器子路径 /dmc-admin/ 下(host nginx),所以静态资源和
  // 路由都要带 base;dev(base 默认 /)不受影响。API 走 /dmc-api/(nginx 反代
  // 到 backend :3001),避免占用裸 /api 这种全局路径。
  base: '/dmc-admin/',
  publicPath: '/dmc-admin/',

  // dev server port 用 PORT env var(在 package.json 的 dev script 设 PORT=6174)
  // 跟桌面端 5173 错开

  // dev 时 /dmc-api/* 代理到 backend(避 CORS),prod 由 nginx location /dmc-api/ 反代
  proxy: {
    '/dmc-api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      pathRewrite: { '^/dmc-api': '' },
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
    // 免登录 DMC 工具(给公司内部人员):layout:false 不套后管框架,纯前端不发鉴权请求
    { path: '/tool', layout: false, component: '@/pages/DmcTool' },
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
      path: '/orders',
      component: '@/pages/Orders',
      name: '订单管理',
      icon: 'DollarOutlined',
    },
    {
      path: '/dmc-batches',
      component: '@/pages/DmcBatches',
      name: 'DMC 序号生成',
      icon: 'BarcodeOutlined',
    },
    {
      path: '/dmc-recognize',
      component: '@/pages/DmcRecognizeCompare',
      name: 'DMC 识别对比',
      icon: 'ScanOutlined',
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
