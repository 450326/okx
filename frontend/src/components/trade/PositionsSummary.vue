<template>
  <!-- 当前持仓摘要卡片 -->
  <section class="card">
    <h2 class="section-title">{{ $t('summary.positionTitle') }}</h2>
    <!-- 持仓数据表格 -->
    <table class="table">
      <!-- 表头 -->
      <thead>
        <tr>
          <th>{{ $t('summary.symbol') }}</th>
          <th>{{ $t('summary.direction') }}</th>
          <th>{{ $t('summary.leverage') }}</th>
          <th>{{ $t('summary.qty') }}</th>
          <th>{{ $t('summary.entryPrice') }}</th>
          <th>{{ $t('summary.openTime') }}</th>
          <th>{{ $t('summary.pnl') }}</th>
          <th></th>
        </tr>
      </thead>
      <!-- 表体 -->
      <tbody>
        <tr v-for="item in positions" :key="item.id" class="pos-row" @click="goTrade(item.symbol)">
          <td>{{ item.symbol }}</td>
          <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('summary.long') : $t('summary.short') }}</td>
          <td>{{ item.leverage }}x</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.entryPrice }}</td>
          <td class="time-cell">{{ formatOpenTime(item.createdAt) }}</td>
          <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
          <td><button class="close-btn" :disabled="closingId === item.id" @click.stop="handleClose(item)">{{ closingId === item.id ? '...' : $t('summary.close') }}</button></td>
        </tr>
      </tbody>
    </table>
    <div v-if="!positions.length" class="empty-state">{{ $t('summary.noPosition') }}</div>
  </section>

  <!-- 当前委托摘要卡片 -->
  <section class="card">
    <h2 class="section-title">{{ $t('summary.orderTitle') }}</h2>
    <table class="table">
      <thead>
        <tr>
          <th>{{ $t('summary.orderId') }}</th>
          <th>{{ $t('summary.type') }}</th>
          <th>{{ $t('summary.price') }}</th>
          <th>{{ $t('summary.qty') }}</th>
          <th>{{ $t('summary.status') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in openOrders" :key="item.orderId">
          <td>{{ item.orderId }}</td>
          <td>{{ item.orderType }}</td>
          <td>{{ item.price || '--' }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.status }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!openOrders.length" class="empty-state">{{ $t('summary.noOrder') }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { $t } from '../../utils/i18n';
import type { OrderItem, PositionItem } from '../../api/types';
import { positionApi } from '../../api/services';
import { formatSignedValue, getTrendClass } from '../../utils/format';

const props = defineProps<{
  positions: PositionItem[];
  openOrders: OrderItem[];
}>();

const emit = defineEmits<{
  (e: 'closed'): void;
}>();

const router = useRouter();
const closingId = ref('');

function formatOpenTime(iso?: string) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function goTrade(symbol: string) {
  router.push(`/trade/${symbol}`);
}

async function handleClose(item: PositionItem) {
  if (closingId.value) return;
  closingId.value = item.id;
  try {
    await positionApi.closePosition(item.id, { symbol: item.symbol });
    emit('closed');
  } catch {
    // ignore
  }
  closingId.value = '';
}
</script>

<style scoped>
.pos-row {
  cursor: pointer;
  transition: background 0.12s;
}

.pos-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.time-cell {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.close-btn {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-down);
  background: transparent;
  color: var(--color-down);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
}

.close-btn:hover {
  background: rgba(246, 70, 93, 0.12);
}

.close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
