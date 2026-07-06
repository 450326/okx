<template>
  <div class="page">
    <h1 class="page-title">{{ $t('market.pageTitle') }}</h1>

    <section class="card">
      <div class="form-grid">
        <div class="field">
          <label>{{ $t('market.searchSymbol') }}</label>
          <input v-model="keyword" placeholder="例如 BTC / ETH / SOL" />
        </div>
        <div class="field">
          <label>{{ $t('market.category') }}</label>
          <select v-model="category">
            <option value="all">{{ $t('market.all') }}</option>
            <option value="main">{{ $t('market.main') }}</option>
            <option value="favorite">{{ $t('market.favorite') }}</option>
          </select>
        </div>
        <div class="field">
          <label>{{ $t('market.sort') }}</label>
          <select v-model="sortKey">
            <option value="priceChange">{{ $t('market.byChange') }}</option>
            <option value="volume">{{ $t('market.byVolume') }}</option>
          </select>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('market.tradableContracts') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('trade.lastPrice') }}</th>
            <th>{{ $t('trade.bid') }}</th>
            <th>{{ $t('trade.ask') }}</th>
            <th>{{ $t('trade.change24h') }}</th>
            <th>{{ $t('assets.actions') }}</th>
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
              <RouterLink class="primary-btn" :to="`/trade/${item.symbol}`">{{ $t('market.goTrade') }}</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty-state">{{ $t('market.noMatch') }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useMarketStore } from '../stores/market';
import { formatPercent, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const marketStore = useMarketStore();

const keyword = ref('');
const category = ref<'all' | 'main' | 'favorite'>('all');
const sortKey = ref<'priceChange' | 'volume'>('priceChange');

const rows = computed(() => {
  const merged = marketStore.symbols.map((symbol) => ({
    ...symbol,
    ...marketStore.tickerMap[symbol.symbol],
  }));

  const normalizedKeyword = keyword.value.trim().toUpperCase();

  let filtered = merged.filter((item) => !normalizedKeyword || item.symbol.includes(normalizedKeyword));

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

async function loadPageData() {
  await Promise.all([marketStore.fetchSymbols(), marketStore.fetchTickers()]);
}

onMounted(() => {
  void loadPageData();
});
</script>
