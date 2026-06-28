<template>
  <section class="card">
    <h2 class="section-title">{{ symbol }}</h2>
    <div class="grid-2">
      <div>
        <div class="stat-label">最新价</div>
        <div class="stat-value">{{ ticker?.lastPrice || '--' }}</div>
      </div>
      <div>
        <div class="stat-label">标记价</div>
        <div class="stat-value">{{ ticker?.markPrice || '--' }}</div>
      </div>
      <div>
        <div class="stat-label">指数价</div>
        <div class="stat-value">{{ ticker?.indexPrice || '--' }}</div>
      </div>
      <div>
        <div class="stat-label">24H 涨跌</div>
        <div :class="['stat-value', changeClass]">{{ changePercent }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TickerItem } from '../../api/types';
import { formatPercent, getTrendClass } from '../../utils/format';

const props = defineProps<{
  symbol: string;
  ticker?: TickerItem | null;
}>();

const changePercent = computed(() => formatPercent(props.ticker?.priceChangePercent24h || 0));
const changeClass = computed(() => getTrendClass(props.ticker?.priceChangePercent24h || 0));
</script>
