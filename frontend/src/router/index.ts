import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../pages/LoginPage.vue';
import AppLayout from '../layouts/AppLayout.vue';
import HomePage from '../pages/HomePage.vue';
import MarketsPage from '../pages/MarketsPage.vue';
import TradePage from '../pages/TradePage.vue';
import PositionsPage from '../pages/PositionsPage.vue';
import AssetsPage from '../pages/AssetsPage.vue';
import OrdersHistoryPage from '../pages/OrdersHistoryPage.vue';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'home', component: HomePage },
        { path: 'markets', name: 'markets', component: MarketsPage },
        { path: 'trade/:symbol?', name: 'trade', component: TradePage, props: true },
        { path: 'positions', name: 'positions', component: PositionsPage },
        { path: 'assets', name: 'assets', component: AssetsPage },
        { path: 'orders/history', name: 'orders-history', component: OrdersHistoryPage },
      ],
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  if (to.name === 'login') {
    next({ name: 'home' });
    return;
  }
  if (to.meta?.requiresAuth) {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      const authStore = useAuthStore();
      try {
        await authStore.login('demo@test.com', 'demo');
      } catch {
        next();
        return;
      }
    }
    if (!useAuthStore().isAuthenticated) {
      try {
        await useAuthStore().fetchMe();
      } catch {
        // 开发阶段忽略登录失败
      }
    }
  }
  next();
});

export default router;
