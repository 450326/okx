import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import HomePage from '../pages/HomePage.vue';
import MarketsPage from '../pages/MarketsPage.vue';
import TradePage from '../pages/TradePage.vue';
import PositionsPage from '../pages/PositionsPage.vue';
import AssetsPage from '../pages/AssetsPage.vue';
import OrdersHistoryPage from '../pages/OrdersHistoryPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
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

export default router;
