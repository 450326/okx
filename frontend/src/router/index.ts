// 引入 Vue Router 创建函数和 History 模式
import { createRouter, createWebHistory } from 'vue-router';
// 引入登录页面组件
import LoginPage from '../pages/LoginPage.vue';
// 引入应用布局组件
import AppLayout from '../layouts/AppLayout.vue';
// 引入首页组件
import HomePage from '../pages/HomePage.vue';
// 引入行情页面组件
import MarketsPage from '../pages/MarketsPage.vue';
// 引入预测市场页面组件
import PredictionPage from '../pages/PredictionPage.vue';
// 引入预测市场详情页面组件
import PredictionDetailPage from '../pages/PredictionDetailPage.vue';
// 引入交易页面组件
import TradePage from '../pages/TradePage.vue';
// 引入现货页面组件
import SpotPage from '../pages/SpotPage.vue';
// 引入持仓页面组件
import PositionsPage from '../pages/PositionsPage.vue';
// 引入资产页面组件
import AssetsPage from '../pages/AssetsPage.vue';
// 引入设置页面组件
import SettingsPage from '../pages/SettingsPage.vue';
import ServerSettingsPage from '../pages/ServerSettingsPage.vue';
// 引入历史委托页面组件
import OrdersHistoryPage from '../pages/OrdersHistoryPage.vue';
// 引入认证状态 Store
import { useAuthStore } from '../stores/auth';

// 创建路由实例
const router = createRouter({
  // 使用 HTML5 History 模式
  history: createWebHistory(),
  // 路由配置表
  routes: [
    {
      path: '/login',      // 登录页路由
      name: 'login',        // 路由名称
      component: LoginPage, // 登录页组件
    },
    {
      path: '/server-settings',
      name: 'server-settings',
      component: ServerSettingsPage,
    },
    {
      path: '/',            // 根路径，使用应用布局
      component: AppLayout,  // 布局组件
      meta: { requiresAuth: true },  // 元信息：需要登录
      children: [
        { path: '', name: 'home', component: HomePage },                    // 首页
        { path: 'markets', name: 'markets', component: MarketsPage },       // 行情页
        { path: 'prediction', name: 'prediction', component: PredictionPage },  // 预测市场页
        { path: 'prediction/:slug', name: 'prediction-detail', component: PredictionDetailPage, props: true },  // 预测市场详情
        { path: 'trade/:symbol?', name: 'trade', component: TradePage, props: true },  // 交易页（可选交易对参数）
        { path: 'spot/:symbol?', name: 'spot', component: SpotPage, props: true },  // 现货页（可选交易对参数）
        { path: 'positions', name: 'positions', component: PositionsPage }, // 持仓页
        { path: 'assets', name: 'assets', component: AssetsPage },          // 资产页
        { path: 'settings', name: 'settings', component: SettingsPage },    // 设置页
        { path: 'orders/history', name: 'orders-history', component: OrdersHistoryPage },  // 历史委托页
      ],
    },
  ],
});

// 全局路由前置守卫：未登录时跳转登录页，不再自动使用演示账号
router.beforeEach(async (to) => {
  // 登录页与服务器设置页始终可访问
  if (to.name === 'login') return true;
  if (to.name === 'server-settings') return true;

  // 不需要认证的路由直接放行
  if (!to.meta?.requiresAuth) return true;

  const authStore = useAuthStore();
  const token = localStorage.getItem('accessToken');

  // 没有令牌：带上回跳地址去登录页，由用户自己选择账号或游客登录
  if (!token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // 有令牌但内存里还没有用户信息（例如刷新页面），补拉一次
  if (!authStore.isAuthenticated) {
    try {
      await authStore.fetchMe();
    } catch {
      // 令牌失效时清掉本地会话，避免带着坏 token 反复请求
      await authStore.logout();
    }
  }

  if (!authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  return true;
});

// 导出路由实例
export default router;
