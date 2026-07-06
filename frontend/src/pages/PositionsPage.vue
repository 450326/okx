<template>
  <div class="page">
    <h1 class="page-title">{{ $t('positions.pageTitle') }}</h1>

    <section class="card">
      <h2 class="section-title">{{ $t('positions.currentPositions') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('positions.direction') }}</th>
            <th>{{ $t('positions.leverage') }}</th>
            <th>{{ $t('positions.qty') }}</th>
            <th>{{ $t('positions.entryPrice') }}</th>
            <th>{{ $t('positions.markPrice') }}</th>
            <th>{{ $t('positions.liquidationPrice') }}</th>
            <th>{{ $t('positions.pnl') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in livePositions" :key="item.id">
            <td>{{ item.symbol }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('positions.long') : $t('positions.short') }}</td>
            <td>{{ item.leverage }}x</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.entryPrice }}</td>
            <td>{{ item.markPrice }}</td>
            <td>{{ item.liquidationPrice }}</td>
            <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!livePositions.length" class="empty-state">{{ $t('positions.noData') }}</div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('positions.openOrders') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('positions.orderId') }}</th>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('positions.orderType') }}</th>
            <th>{{ $t('positions.direction') }}</th>
            <th>{{ $t('positions.price') }}</th>
            <th>{{ $t('positions.qty') }}</th>
            <th>{{ $t('positions.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in orderStore.openOrders" :key="item.orderId">
            <td>{{ item.orderId }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ item.orderType }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('positions.openLong') : $t('positions.openShort') }}</td>
            <td>{{ item.price || '--' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.openOrders.length" class="empty-state">{{ $t('positions.noOrders') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useModeStore } from '../stores/mode';
import { useMarketStore } from '../stores/market';
import { useOrderStore } from '../stores/orders';
import { usePositionStore } from '../stores/positions';
import { formatSignedValue, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const modeStore = useModeStore();
const marketStore = useMarketStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

// 利用 WebSocket 实时行情重算持仓盈亏
const livePositions = computed(() =>
  positionStore.positions.map((p) => {
    const ticker = marketStore.tickerMap[p.symbol];
    if (!ticker) return p;
    const entry = Number(p.entryPrice);
    const mark = Number(ticker.markPrice || ticker.lastPrice);
    const qty = Number(p.qty);
    const pnl = p.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
    return {
      ...p,
      unrealizedPnl: pnl.toFixed(2),
      markPrice: ticker.markPrice || ticker.lastPrice,
      lastPrice: ticker.lastPrice,
    };
  }),
);

async function loadPageData() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchOpenOrders(modeStore.mode),
  ]);
}

watch(
  () => modeStore.mode,
  () => {
    void loadPageData();
  },
  { immediate: true },
);
</script>
