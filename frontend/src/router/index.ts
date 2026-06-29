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
  if (to.meta?.requiresAuth) {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      next({ name: 'login' });
      return;
    }
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) {
      try {
        await authStore.fetchMe();
      } catch {
        next({ name: 'login' });
        return;
      }
    }
  }
  next();
});

export default router;
