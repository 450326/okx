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
            <th></th>
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
            <td>
              <button class="action-btn" :disabled="closingId === item.id" @click="handleClose(item)">
                {{ closingId === item.id ? '...' : $t('summary.close') }}
              </button>
            </td>
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
            <th></th>
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
            <td>
              <button class="action-btn" :disabled="cancellingId === item.orderId" @click="handleCancel(item)">
                {{ cancellingId === item.orderId ? '...' : $t('summary.cancel') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.openOrders.length" class="empty-state">{{ $t('positions.noOrders') }}</div>
      <div v-if="errorMessage" class="status-text error-text">{{ errorMessage }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useModeStore } from '../stores/mode';
import { useMarketStore } from '../stores/market';
import { useOrderStore } from '../stores/orders';
import { usePositionStore } from '../stores/positions';
import { useAssetStore } from '../stores/assets';
import { positionApi } from '../api/services';
import type { OrderItem, PositionItem } from '../api/types';
import { formatSignedValue, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const modeStore = useModeStore();
const marketStore = useMarketStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();
const assetStore = useAssetStore();

const closingId = ref('');
const cancellingId = ref('');
const errorMessage = ref('');

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
    assetStore.fetchAssets(modeStore.mode),
  ]);
}

async function handleClose(item: PositionItem) {
  if (closingId.value) return;
  closingId.value = item.id;
  errorMessage.value = '';
  try {
    await positionApi.closePosition(item.id, { symbol: item.symbol });
    await loadPageData();
  } catch (error) {
    errorMessage.value = (error as Error).message || '平仓失败';
  } finally {
    closingId.value = '';
  }
}

async function handleCancel(item: OrderItem) {
  if (cancellingId.value) return;
  cancellingId.value = item.orderId;
  errorMessage.value = '';
  const success = await orderStore.cancelOrder(item.orderId, modeStore.mode);
  if (success) {
    await loadPageData();
  } else {
    errorMessage.value = orderStore.error || '撤单失败';
  }
  cancellingId.value = '';
}

watch(
  () => modeStore.mode,
  () => {
    void loadPageData();
  },
  { immediate: true },
);
</script>

<style scoped>
.action-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-down);
  border-radius: 999px;
  background: transparent;
  color: var(--color-down);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.action-btn:hover {
  background: rgba(246, 70, 93, 0.12);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.error-text {
  margin-top: 8px;
  color: var(--color-down);
}
</style>
