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
            <th class="sortable" @click="toggleSort('lastPrice')">
              {{ $t('trade.lastPrice') }}
              <span class="sort-arrows">
                <i :class="{ active: sortKey === 'lastPrice' && sortDirection === 'asc' }">▲</i>
                <i :class="{ active: sortKey === 'lastPrice' && sortDirection === 'desc' }">▼</i>
              </span>
            </th>
            <th>{{ $t('trade.bid') }}</th>
            <th>{{ $t('trade.ask') }}</th>
            <th class="sortable" @click="toggleSort('priceChange')">
              {{ $t('trade.change24h') }}
              <span class="sort-arrows">
                <i :class="{ active: sortKey === 'priceChange' && sortDirection === 'asc' }">▲</i>
                <i :class="{ active: sortKey === 'priceChange' && sortDirection === 'desc' }">▼</i>
              </span>
            </th>
            <th class="sortable" @click="toggleSort('volume')">
              {{ $t('trade.volume24h') }}
              <span class="sort-arrows">
                <i :class="{ active: sortKey === 'volume' && sortDirection === 'asc' }">▲</i>
                <i :class="{ active: sortKey === 'volume' && sortDirection === 'desc' }">▼</i>
              </span>
            </th>
            <th class="sortable" :title="$t('market.marketValueHint')" @click="toggleSort('marketValue')">
              {{ $t('market.marketValue') }}
              <span class="sort-arrows">
                <i :class="{ active: sortKey === 'marketValue' && sortDirection === 'asc' }">▲</i>
                <i :class="{ active: sortKey === 'marketValue' && sortDirection === 'desc' }">▼</i>
              </span>
            </th>
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
            <td>{{ formatCompactVolume(item.volume24h) }}</td>
            <td>{{ formatCompactVolume(marketValue(item)) }}</td>
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
import { formatCompactVolume, formatPercent, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const marketStore = useMarketStore();
const route = useRoute();

const keyword = ref('');
const category = ref<'all' | 'crypto' | 'stock' | 'main' | 'favorite'>('all');
type SortKey = 'lastPrice' | 'priceChange' | 'volume' | 'marketValue';
const sortKey = ref<SortKey>('priceChange');
const sortDirection = ref<'asc' | 'desc'>('desc');
const selectedExchange = ref(marketStore.exchange);

function marketValue(item: { lastPrice?: string; volume24h?: string }): number {
  return Number(item.lastPrice || 0) * Number(item.volume24h || 0);
}

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  sortDirection.value = 'desc';
}

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
    const direction = sortDirection.value === 'asc' ? 1 : -1;
    let difference = 0;

    if (sortKey.value === 'lastPrice') {
      difference = Number(left.lastPrice || 0) - Number(right.lastPrice || 0);
    } else if (sortKey.value === 'volume') {
      difference = Number(left.volume24h || 0) - Number(right.volume24h || 0);
    } else if (sortKey.value === 'marketValue') {
      difference = marketValue(left) - marketValue(right);
    } else {
      difference = Number(left.priceChangePercent24h || 0) - Number(right.priceChangePercent24h || 0);
    }

    return difference * direction;
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

/* 可排序表头：最新价 / 涨跌幅 / 成交量 / 市值 */
.table th.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.table th.sortable:hover {
  color: var(--text-primary);
}

.sort-arrows {
  display: inline-flex;
  flex-direction: column;
  gap: 0;
  margin-left: 6px;
  font-size: 11px;
  line-height: 0.75;
  vertical-align: middle;
}

.sort-arrows i {
  color: #5b6270;
  font-style: normal;
}

.sort-arrows i.active {
  color: var(--text-primary);
}

.form-grid .field {
  align-content: start;
}

.form-grid .field select {
  align-self: start;
}

@media (min-width: 761px) {
  .form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
