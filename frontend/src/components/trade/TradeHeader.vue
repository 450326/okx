<template>
  <!-- 交易对信息卡片 -->
  <section class="card">
    <!-- 交易对名称标题 -->
    <h2 class="section-title">{{ symbol }}</h2>
    <!-- 4 列数据网格 -->
    <div class="grid-2">
      <!-- 最新价 -->
      <div>
        <div class="stat-label">最新价</div>
        <div class="stat-value">{{ ticker?.lastPrice || '--' }}</div>
      </div>
      <!-- 标记价 -->
      <div>
        <div class="stat-label">标记价</div>
        <div class="stat-value">{{ ticker?.markPrice || '--' }}</div>
      </div>
      <!-- 指数价 -->
      <div>
        <div class="stat-label">指数价</div>
        <div class="stat-value">{{ ticker?.indexPrice || '--' }}</div>
      </div>
      <!-- 24H 涨跌幅 -->
      <div>
        <div class="stat-label">24H 涨跌</div>
        <div :class="['stat-value', changeClass]">{{ changePercent }}</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
// 导入 Vue 响应式工具
import { computed } from 'vue';
// 导入数据类型定义
import type { TickerItem } from '../../api/types';
// 导入格式化工具函数
import { formatPercent, getTrendClass } from '../../utils/format';

// 定义组件 props：交易对名称和 ticker 数据
const props = defineProps<{
  symbol: string;
  ticker?: TickerItem | null;
}>();

// 计算 24 小时涨跌幅百分比文本
const changePercent = computed(() => formatPercent(props.ticker?.priceChangePercent24h || 0));
// 计算涨跌趋势样式类名
const changeClass = computed(() => getTrendClass(props.ticker?.priceChangePercent24h || 0));
</script>
