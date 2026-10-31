<template>
  <div class="page">
    <h1 class="page-title">{{ $t('orders.pageTitle') }}</h1>

    <section class="card">
      <h2 class="section-title">{{ $t('orders.history') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('orders.orderId') }}</th>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('orders.direction') }}</th>
            <th>{{ $t('orders.orderType') }}</th>
            <th>{{ $t('orders.entrustPrice') }}</th>
            <th>{{ $t('orders.avgPrice') }}</th>
            <th>{{ $t('orders.qty') }}</th>
            <th>{{ $t('orders.fee') }}</th>
            <th>{{ $t('orders.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in orderStore.historyOrders" :key="item.orderId">
            <td>{{ formatOrderId(item.orderId) }}</td>
            <td>
              <div class="symbol-cell">
                <CoinIcon :symbol="item.symbol" :size="22" />
                <span>{{ item.symbol }}</span>
              </div>
            </td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ formatDirection(item) }}</td>
            <td>{{ item.orderType }}</td>
            <td>{{ item.price || '-' }}</td>
            <td>{{ item.avgFillPrice || '-' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.fee || '-' }}</td>
            <td>{{ formatOrderStatus(item.status) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.historyOrders.length" class="empty-state">{{ $t('orders.noHistory') }}</div>
    </section>

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">{{ $t('spot.orders') }}</h2>
        <span class="status-text">{{ $t('spot.simulation') }}</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('trade.time') }}</th>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('trade.side') }}</th>
            <th>{{ $t('spot.qty') }}</th>
            <th>{{ $t('spot.price') }}</th>
            <th>{{ $t('spot.amount') }}</th>
            <th>{{ $t('spot.fee') }}</th>
            <th>{{ $t('spot.realizedPnl') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in spotStore.orders" :key="item.orderId">
            <td>{{ formatTime(item.createdAt) }}</td>
            <td>
              <div class="symbol-cell">
                <CoinIcon :symbol="item.symbol" :size="22" />
                <span>{{ item.symbol }}</span>
              </div>
            </td>
            <td :class="item.side === 'buy' ? 'up' : 'down'">
              {{ item.side === 'buy' ? $t('spot.buy') : $t('spot.sell') }}
            </td>
            <td>{{ formatQty(item.qty) }}</td>
            <td>{{ formatSpotPrice(item.price) }}</td>
            <td>{{ formatCurrency(item.notional) }}</td>
            <td>{{ formatCurrency(item.fee) }}</td>
            <td :class="getTrendClass(item.realizedPnl)">
              {{ item.side === 'sell' ? formatSignedCurrency(item.realizedPnl) : '--' }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!spotStore.orders.length" class="empty-state">{{ $t('spot.noOrders') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import CoinIcon from '../components/common/CoinIcon.vue';
import { useModeStore } from '../stores/mode';
import { useOrderStore } from '../stores/orders';
import { useSpotStore } from '../stores/spot';
import type { OrderItem } from '../api/types';
import {
  formatCurrency,
  formatOrderId,
  formatOrderStatus,
  formatPrice,
  formatSignedCurrency,
  getTrendClass,
} from '../utils/format';
import { $t } from '../utils/i18n';

const modeStore = useModeStore();
const orderStore = useOrderStore();
const spotStore = useSpotStore();

function formatDirection(item: OrderItem): string {
  if (item.action === 'open') {
    return item.side === 'long' ? $t('positions.openLong') : $t('positions.openShort');
  }
  if (item.action === 'close') {
    return item.side === 'long' ? $t('positions.closeLong') : $t('positions.closeShort');
  }
  return item.side === 'long' ? $t('positions.long') : $t('positions.short');
}

function formatQty(value?: string | number): string {
  return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatSpotPrice(value?: string | number): string {
  const numeric = Number(value) || 0;
  const digits = numeric >= 1000 ? 2 : numeric >= 1 ? 4 : numeric >= 0.01 ? 6 : 8;
  return formatPrice(numeric, digits);
}

function formatTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

async function loadPageData() {
  await Promise.all([
    orderStore.fetchHistory(modeStore.mode),
    spotStore.fetchOrders(),
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

<style scoped>
.symbol-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
</style>
