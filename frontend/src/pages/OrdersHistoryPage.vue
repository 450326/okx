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
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import CoinIcon from '../components/common/CoinIcon.vue';
import { useModeStore } from '../stores/mode';
import { useOrderStore } from '../stores/orders';
import type { OrderItem } from '../api/types';
import { formatOrderId, formatOrderStatus } from '../utils/format';
import { $t } from '../utils/i18n';

const modeStore = useModeStore();
const orderStore = useOrderStore();

function formatDirection(item: OrderItem): string {
  if (item.action === 'open') {
    return item.side === 'long' ? $t('positions.openLong') : $t('positions.openShort');
  }
  if (item.action === 'close') {
    return item.side === 'long' ? $t('positions.closeLong') : $t('positions.closeShort');
  }
  return item.side === 'long' ? $t('positions.long') : $t('positions.short');
}

async function loadPageData() {
  await orderStore.fetchHistory(modeStore.mode);
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
