<template>
  <!-- 行情页容器 -->
  <div class="page">
    <h1 class="page-title">行情页</h1>

    <!-- 筛选与搜索区 -->
    <section class="card">
      <div class="form-grid">
        <div class="field">
          <label>搜索品种</label>
          <input v-model="keyword" placeholder="例如 BTC / ETH / SOL" />
        </div>
        <div class="field">
          <label>分类</label>
          <select v-model="category">
            <option value="all">全部</option>
            <option value="main">主流</option>
            <option value="favorite">自选</option>
          </select>
        </div>
        <div class="field">
          <label>排序</label>
          <select v-model="sortKey">
            <option value="priceChange">按涨跌幅</option>
            <option value="volume">按成交量</option>
          </select>
        </div>
      </div>
    </section>

    <!-- 可交易合约列表 -->
    <section class="card">
      <h2 class="section-title">可交易合约</h2>
      <table class="table">
        <thead>
          <tr>
            <th>品种</th>
            <th>最新价</th>
            <th>买一</th>
            <th>卖一</th>
            <th>24H 涨跌</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.symbol">
            <td>{{ item.symbol }}</td>
            <td>{{ item.lastPrice || '--' }}</td>
            <td>{{ item.bidPrice || '--' }}</td>
            <td>{{ item.askPrice || '--' }}</td>
            <td :class="getTrendClass(item.priceChangePercent24h)">
              {{ formatPercent(item.priceChangePercent24h) }}
            </td>
            <td>
              <RouterLink class="primary-btn" :to="`/trade/${item.symbol}`">去交易</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty-state">暂无匹配的合约</div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Vue 响应式工具与生命周期
import { computed, onMounted, ref } from 'vue';
// Vue Router 导航组件
import { RouterLink } from 'vue-router';
// 行情状态管理
import { useMarketStore } from '../stores/market';
// 数值格式化与涨跌颜色工具函数
import { formatPercent, getTrendClass } from '../utils/format';

// 行情 Store 实例
const marketStore = useMarketStore();

// 搜索关键词
const keyword = ref('');
// 分类筛选（全部 / 主流 / 自选）
const category = ref<'all' | 'main' | 'favorite'>('all');
// 排序方式（涨跌幅 / 成交量）
const sortKey = ref<'priceChange' | 'volume'>('priceChange');

// 经过筛选与排序后的合约行数据
const rows = computed(() => {
  const merged = marketStore.symbols.map((symbol) => ({
    ...symbol,
    ...marketStore.tickerMap[symbol.symbol],
  }));

  const normalizedKeyword = keyword.value.trim().toUpperCase();

  let filtered = merged.filter((item) => !normalizedKeyword || item.symbol.includes(normalizedKeyword));

  if (category.value === 'main') {
    filtered = filtered.slice(0, 5);
  }

  if (category.value === 'favorite') {
    filtered = [];
  }

  return [...filtered].sort((left, right) => {
    if (sortKey.value === 'volume') {
      return Number(right.volume24h || 0) - Number(left.volume24h || 0);
    }

    return Number(right.priceChangePercent24h || 0) - Number(left.priceChangePercent24h || 0);
  });
});

// 加载行情页面数据
async function loadPageData() {
  await Promise.all([marketStore.fetchSymbols(), marketStore.fetchTickers()]);
}

// 页面挂载时加载数据
onMounted(() => {
  void loadPageData();
});
</script>
