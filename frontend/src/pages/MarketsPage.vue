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
          <select v-model="category" @change="handleCategoryChange">
            <option value="all">{{ $t('market.all') }}</option>
            <option value="crypto">加密货币</option>
            <option value="stock">股票代币</option>
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
        <div class="field">
          <label>交易所</label>
          <select
            v-model="selectedExchange"
            :disabled="category === 'stock'"
            :title="category === 'stock' ? '股票代币目前只支持 OKX' : ''"
            @change="handleExchangeChange"
          >
            <option value="okx">OKX</option>
            <option value="binance">Binance</option>
            <option value="coinbase">Coinbase</option>
            <option value="uniswap">Uniswap</option>
            <option value="polymarket">Polymarket</option>
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
            <td>
              <div class="symbol-cell">
                <CoinIcon :symbol="item.symbol" :size="26" :asset-class="item.assetClass" />
                <span>{{ item.symbol }}</span>
                <em v-if="item.assetClass === 'stock'" class="asset-badge">股票</em>
              </div>
            </td>
            <td>{{ item.lastPrice || '--' }}</td>
            <td>{{ item.bidPrice || '--' }}</td>
            <td>{{ item.askPrice || '--' }}</td>
            <td :class="getTrendClass(item.priceChangePercent24h)">
              {{ formatPercent(item.priceChangePercent24h) }}
            </td>
            <td>
              <RouterLink
                class="primary-btn"
                :to="item.assetClass === 'stock'
                  ? { path: `/trade/${item.symbol}`, query: { asset: 'stock' } }
                  : `/trade/${item.symbol}`"
                @click="handleTradeClick(item)"
              >
                {{ $t('market.goTrade') }}
              </RouterLink>
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
import { RouterLink, useRoute } from 'vue-router';
import CoinIcon from '../components/common/CoinIcon.vue';
import { useMarketStore } from '../stores/market';
import { formatPercent, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const marketStore = useMarketStore();
const route = useRoute();

const keyword = ref('');
const category = ref<'all' | 'crypto' | 'stock' | 'main' | 'favorite'>('all');
const sortKey = ref<'priceChange' | 'volume'>('priceChange');
const selectedExchange = ref(marketStore.exchange);

const rows = computed(() => {
  const useStock = category.value === 'stock';
  const sourceSymbols = useStock
    ? marketStore.stockSymbols
    : category.value === 'crypto'
      ? marketStore.symbols.filter((item) => item.assetClass !== 'stock')
      : marketStore.symbols;
  const sourceTickers = useStock ? marketStore.stockTickers : marketStore.tickers;
  const tickerMap = new Map(sourceTickers.map((ticker) => [ticker.symbol, ticker]));

  const merged = sourceSymbols.map((symbol) => ({
    ...symbol,
    ...tickerMap.get(symbol.symbol),
    assetClass: symbol.assetClass || tickerMap.get(symbol.symbol)?.assetClass,
  }));

  const normalizedKeyword = keyword.value.trim().toUpperCase();

  let filtered = merged.filter(
    (item) => !normalizedKeyword || item.symbol.toUpperCase().includes(normalizedKeyword),
  );

  if (category.value === 'favorite') {
    filtered = [];
  }

  if (category.value === 'main') {
    const majors = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);
    filtered = filtered.filter((item) => majors.has(item.baseCoin || ''));
  }

  return [...filtered].sort((left, right) => {
    if (sortKey.value === 'volume') {
      return Number(right.volume24h || 0) - Number(left.volume24h || 0);
    }

    return Number(right.priceChangePercent24h || 0) - Number(left.priceChangePercent24h || 0);
  });
});

async function loadPageData() {
  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchTickers(),
    marketStore.fetchStockMarkets(),
  ]);
}

async function handleExchangeChange() {
  marketStore.setExchange(selectedExchange.value);
  await loadPageData();
}

function handleTradeClick(item: { assetClass?: 'crypto' | 'stock' }) {
  if (item.assetClass === 'stock' && marketStore.exchange !== 'okx') {
    marketStore.setExchange('okx');
  }
}

function handleCategoryChange() {
  if (category.value === 'stock' && marketStore.exchange !== 'okx') {
    marketStore.setExchange('okx');
    selectedExchange.value = 'okx';
    void loadPageData();
  }
}

onMounted(() => {
  if (route.query.category === 'stock') {
    category.value = 'stock';
    if (marketStore.exchange !== 'okx') {
      marketStore.setExchange('okx');
      selectedExchange.value = 'okx';
    }
  }
  void loadPageData();
});
</script>

<style scoped>
.symbol-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.asset-badge {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.16);
  color: #60a5fa;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}
</style>
