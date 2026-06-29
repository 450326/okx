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
// 引入交易页面组件
import TradePage from '../pages/TradePage.vue';
// 引入持仓页面组件
import PositionsPage from '../pages/PositionsPage.vue';
// 引入资产页面组件
import AssetsPage from '../pages/AssetsPage.vue';
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
      path: '/',            // 根路径，使用应用布局
      component: AppLayout,  // 布局组件
      meta: { requiresAuth: true },  // 元信息：需要登录
      children: [
        { path: '', name: 'home', component: HomePage },                    // 首页
        { path: 'markets', name: 'markets', component: MarketsPage },       // 行情页
        { path: 'trade/:symbol?', name: 'trade', component: TradePage, props: true },  // 交易页（可选交易对参数）
        { path: 'positions', name: 'positions', component: PositionsPage }, // 持仓页
        { path: 'assets', name: 'assets', component: AssetsPage },          // 资产页
        { path: 'orders/history', name: 'orders-history', component: OrdersHistoryPage },  // 历史委托页
      ],
    },
  ],
});

// 全局路由前置守卫：自动登录 / 认证检查
router.beforeEach(async (to, _from, next) => {
  // 如果已登录则重定向到首页
  if (to.name === 'login') {
    next({ name: 'home' });
    return;
  }
  // 检查需要认证的路由
  if (to.meta?.requiresAuth) {
    // 从 localStorage 获取访问令牌
    const token = localStorage.getItem('accessToken');
    if (!token) {
      // 无令牌时使用演示账号自动登录
      const authStore = useAuthStore();
      try {
        await authStore.login('demo@test.com', 'demo');
      } catch {
        next();
        return;
      }
    }
    // 如果尚未认证则拉取用户信息
    if (!useAuthStore().isAuthenticated) {
      try {
        await useAuthStore().fetchMe();
      } catch {
        // 开发阶段忽略登录失败
      }
    }
  }
  // 继续导航
  next();
});

// 导出路由实例
export default router;
