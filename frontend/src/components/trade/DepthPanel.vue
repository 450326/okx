<template>
  <section class="card depth-card">
    <div class="panel-head">
      <h2 class="section-title">{{ $t('depth.title') }}</h2>
      <span class="status-text">{{ loading ? $t('common.loading') : $t('depth.live') }}</span>
    </div>

    <div class="depth-body">
      <div class="depth-side">
        <div class="depth-header">
          <span>{{ $t('depth.price') }}</span>
          <span>{{ $t('depth.qty') }}</span>
          <span>{{ $t('depth.total') }}</span>
        </div>
        <div v-if="visibleAsks.length" class="depth-rows">
          <div v-for="item in visibleAsks" :key="`a-${item.price}`" class="depth-row down">
            <span class="dp-price">{{ item.price }}</span>
            <span class="dp-vol">{{ formatQty(item.qty) }}</span>
            <span class="dp-vol">{{ formatQty(item.total) }}</span>
            <div class="dp-bar ask-bar" :style="{ width: barWidth(item.total, maxAsk) }"></div>
          </div>
        </div>
        <div class="depth-mid">
          <strong class="mid-price">{{ midPrice }}</strong>
        </div>
        <div v-if="visibleBids.length" class="depth-rows">
          <div v-for="item in visibleBids" :key="`b-${item.price}`" class="depth-row up">
            <span class="dp-price">{{ item.price }}</span>
            <span class="dp-vol">{{ formatQty(item.qty) }}</span>
            <span class="dp-vol">{{ formatQty(item.total) }}</span>
            <div class="dp-bar bid-bar" :style="{ width: barWidth(item.total, maxBid) }"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!asks.length && !bids.length && !loading" class="empty-state">{{ $t('depth.noData') }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DepthLevel } from '../../api/types';
import { $t } from '../../utils/i18n';

const props = defineProps<{
  asks: DepthLevel[];
  bids: DepthLevel[];
  loading: boolean;
}>();

const LEVELS = 5;

const visibleAsks = computed(() => props.asks.slice(0, LEVELS));
const visibleBids = computed(() => props.bids.slice(0, LEVELS));

const maxAsk = computed(() => visibleAsks.value[visibleAsks.value.length - 1]?.total || 1);
const maxBid = computed(() => visibleBids.value[0]?.total || 1);

const midPrice = computed(() => {
  if (!visibleAsks.value.length || !visibleBids.value.length) return '--';
  const ask = Number(visibleAsks.value[visibleAsks.value.length - 1].price);
  const bid = Number(visibleBids.value[0].price);
  return ((ask + bid) / 2).toFixed(1);
});

function formatQty(val: string | number): string {
  const n = Number(val);
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(3);
}

function barWidth(val: string | number, max: number): string {
  return Math.min((Number(val) / max) * 100, 100).toFixed(0) + '%';
}
</script>

<style scoped>
.depth-card {
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.depth-body {
  margin-top: 4px;
}

.depth-side {
  display: flex;
  flex-direction: column;
}

.depth-header {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  padding: 6px 0;
  font-size: 11px;
  color: var(--text-secondary);
  text-align: right;
}

.depth-header span:first-child {
  text-align: left;
}

.depth-rows {
  display: flex;
  flex-direction: column;
}

.depth-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  padding: 4px 0;
  font-size: 12px;
  font-weight: 600;
  position: relative;
  text-align: right;
}

.dp-price {
  text-align: left;
  font-weight: 700;
}

.dp-vol {
  font-weight: 500;
  color: var(--text-secondary);
}

.dp-bar {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  opacity: 0.12;
  border-radius: 2px;
  pointer-events: none;
}

.ask-bar {
  background: var(--color-down);
}

.bid-bar {
  background: var(--color-up);
}

.depth-mid {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.mid-price {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
</style>
