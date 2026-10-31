<template>
  <div class="page spot-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('spot.pageTitle') }}</h1>
        <p class="page-subtitle">{{ $t('spot.subtitle') }}</p>
      </div>
      <span class="mode-badge">{{ $t('spot.simulation') }}</span>
    </div>

    <section class="card">
      <div class="spot-toolbar">
        <div class="exchange-tabs">
          <button
            v-for="item in exchanges"
            :key="item.value"
            type="button"
            :class="['exchange-tab', { active: spotStore.exchange === item.value }]"
            @click="changeExchange(item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <input
          v-model="keyword"
          class="symbol-search"
          :placeholder="$t('spot.searchPlaceholder')"
        />

        <select v-model="selectedSymbol" class="symbol-select">
          <option v-for="item in symbolOptions" :key="item.symbol" :value="item.symbol">
            {{ formatSymbol(item.symbol) }}
          </option>
        </select>
      </div>

      <p v-if="spotStore.error" class="status-text error-text">{{ spotStore.error }}</p>

      <div v-if="ticker" class="ticker-strip">
        <div class="ticker-name">
          <CoinIcon :symbol="selectedSymbol" :size="34" />
          <div>
            <strong>{{ formatSymbol(selectedSymbol) }}</strong>
            <span>{{ $t('spot.spotPair') }}</span>
          </div>
        </div>
        <div class="ticker-price">
          <strong>{{ formatSpotPrice(ticker.lastPrice) }}</strong>
          <span :class="getTrendClass(ticker.priceChangePercent24h)">
            {{ formatPercent(ticker.priceChangePercent24h) }}
          </span>
        </div>
        <div class="ticker-stat">
          <span>{{ $t('trade.high24h') }}</span>
          <strong>{{ formatSpotPrice(ticker.high24h) }}</strong>
        </div>
        <div class="ticker-stat">
          <span>{{ $t('trade.low24h') }}</span>
          <strong>{{ formatSpotPrice(ticker.low24h) }}</strong>
        </div>
        <div class="ticker-stat">
          <span>{{ $t('trade.volume24h') }}</span>
          <strong>{{ formatCompactVolume(ticker.volume24h) }}</strong>
        </div>
      </div>
    </section>

    <div v-if="spotStore.loading && !symbolOptions.length" class="card empty-state">
      {{ $t('spot.loadingMarkets') }}
    </div>

    <div v-else class="spot-layout">
      <section class="card chart-card">
        <KlineChart
          v-model="interval"
          :klines="spotStore.klines"
          :loading="spotStore.chartLoading"
          :symbol="selectedSymbol"
          :exchange="spotStore.exchange"
        />
      </section>

      <SpotOrderForm
        v-model:side="side"
        v-model:qty="qty"
        :symbol="selectedSymbol"
        :ticker="ticker"
        :holding="holding"
        :available="availableCash"
        @submitted="handleSubmitted"
      />
    </div>

    <section class="card">
      <div class="card-head">
        <h2 class="section-title">{{ $t('spot.holdings') }}</h2>
        <span class="muted">{{ formatCurrency(spotValue) }}</span>
      </div>

      <table class="table spot-table">
        <thead>
          <tr>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('spot.qty') }}</th>
            <th>{{ $t('spot.avgCost') }}</th>
            <th>{{ $t('spot.markPrice') }}</th>
            <th>{{ $t('spot.currentValue') }}</th>
            <th>{{ $t('spot.pnl') }}</th>
            <th>{{ $t('assets.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in spotStore.holdings" :key="item.id">
            <td>
              <div class="symbol-cell">
                <CoinIcon :symbol="item.symbol" :size="24" />
                <span>{{ formatSymbol(item.symbol) }}</span>
              </div>
            </td>
            <td>{{ formatQty(item.qty) }}</td>
            <td>{{ formatSpotPrice(item.avgCost) }}</td>
            <td>{{ formatSpotPrice(item.markPrice) }}</td>
            <td>{{ formatCurrency(item.currentValue) }}</td>
            <td :class="getTrendClass(item.unrealizedPnl)">
              {{ formatSignedCurrency(item.unrealizedPnl) }}
              <small>({{ formatPercent(Number(item.roe) * 100) }})</small>
            </td>
            <td>
              <button class="ghost-btn small" type="button" @click="startSell(item)">
                {{ $t('spot.sell') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!spotStore.holdings.length" class="empty-state">{{ $t('spot.noHoldings') }}</div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('spot.orders') }}</h2>
      <table class="table spot-table">
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
            <td>{{ formatSymbol(item.symbol) }}</td>
            <td :class="item.side === 'buy' ? 'text-up' : 'text-down'">
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import CoinIcon from '../components/common/CoinIcon.vue';
import KlineChart from '../components/trade/KlineChart.vue';
import SpotOrderForm from '../components/spot/SpotOrderForm.vue';
import { useSpotStore } from '../stores/spot';
import { useAssetStore } from '../stores/assets';
import type { SpotHoldingRecord } from '../api/types';
import {
  formatCompactVolume,
  formatCurrency,
  formatPercent,
  formatPrice,
  formatSignedCurrency,
  getTrendClass,
} from '../utils/format';
import { $t } from '../utils/i18n';

const spotStore = useSpotStore();
const assetStore = useAssetStore();
const route = useRoute();

const exchanges = [
  { value: 'okx' as const, label: 'OKX' },
  { value: 'coinbase' as const, label: 'Coinbase' },
];

const keyword = ref('');
const selectedSymbol = ref('BTC-USDT');
const interval = ref('5m');
const side = ref<'buy' | 'sell'>('buy');
const qty = ref('');
let tickerTimer: ReturnType<typeof setInterval> | null = null;

const ticker = computed(() => spotStore.tickerMap[selectedSymbol.value]);
const holding = computed<SpotHoldingRecord | undefined>(() =>
  spotStore.holdings.find((item) => item.symbol === selectedSymbol.value),
);
const availableCash = computed(() => Number(assetStore.snapshot?.availableBalance || 0));
const spotValue = computed(() =>
  spotStore.holdings.reduce((total, item) => total + Number(item.currentValue || 0), 0),
);

const symbolOptions = computed(() => {
  const normalized = keyword.value.trim().toUpperCase();
  const matched = spotStore.symbols.filter((item) => {
    if (!normalized) return true;
    const text = `${item.symbol} ${item.baseCoin || ''}`.toUpperCase();
    return text.includes(normalized);
  });
  // 当前选中项始终保留，避免搜索时下拉框变空
  if (!matched.some((item) => item.symbol === selectedSymbol.value)) {
    const current = spotStore.symbols.find((item) => item.symbol === selectedSymbol.value);
    if (current) matched.unshift(current);
  }
  return matched;
});

function formatSymbol(symbol: string): string {
  return String(symbol || '').replace('-SWAP', '').replace('-', '/');
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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function pickSymbol(preferredBase?: string): string {
  const list = spotStore.symbols;
  if (!list.length) return selectedSymbol.value;
  if (preferredBase) {
    const sameBase = list.find((item) => item.baseCoin === preferredBase);
    if (sameBase) return sameBase.symbol;
  }
  const routeSymbol = String(route.params.symbol || '');
  if (routeSymbol && list.some((item) => item.symbol === routeSymbol)) return routeSymbol;
  for (const major of ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']) {
    const found = list.find((item) => item.baseCoin === major);
    if (found) return found.symbol;
  }
  return list[0].symbol;
}

async function loadSymbolData() {
  if (!selectedSymbol.value) return;
  await Promise.all([
    spotStore.fetchKlines(selectedSymbol.value, interval.value),
    spotStore.fetchOrders(selectedSymbol.value),
  ]);
}

async function loadPage(preferredBase?: string) {
  await spotStore.fetchMarkets();
  selectedSymbol.value = pickSymbol(preferredBase);
  await Promise.all([
    spotStore.fetchHoldings(),
    spotStore.fetchOrders(selectedSymbol.value),
    assetStore.fetchAssets('simulation'),
    spotStore.fetchKlines(selectedSymbol.value, interval.value),
  ]);
}

async function changeExchange(next: 'okx' | 'coinbase') {
  if (spotStore.exchange === next) return;
  const base = selectedSymbol.value.split('-')[0];
  spotStore.setExchange(next);
  await loadPage(base);
}

function startSell(item: SpotHoldingRecord) {
  if (selectedSymbol.value !== item.symbol) {
    selectedSymbol.value = item.symbol;
    void nextTick(() => {
      side.value = 'sell';
      qty.value = String(item.qty);
    });
    return;
  }
  side.value = 'sell';
  qty.value = String(item.qty);
}

async function handleSubmitted() {
  await assetStore.fetchAssets('simulation');
  await spotStore.fetchHoldings();
}

watch(selectedSymbol, (symbol) => {
  if (!symbol) return;
  qty.value = '';
  void loadSymbolData();
});

watch(interval, () => {
  void spotStore.fetchKlines(selectedSymbol.value, interval.value);
});

onMounted(async () => {
  const routeSymbol = String(route.params.symbol || '');
  if (routeSymbol.endsWith('-USD') || routeSymbol.endsWith('-USDC')) {
    spotStore.setExchange('coinbase');
  } else if (routeSymbol.endsWith('-USDT')) {
    spotStore.setExchange('okx');
  }
  if (routeSymbol) {
    const base = routeSymbol.split('-')[0];
    await loadPage(base);
  } else {
    await loadPage();
  }
  tickerTimer = setInterval(() => {
    void spotStore.refreshTickers();
    void spotStore.fetchHoldings();
  }, 5000);
});

onUnmounted(() => {
  if (tickerTimer) clearInterval(tickerTimer);
  tickerTimer = null;
});
</script>

<style scoped>
.spot-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(187, 255, 39, 0.12);
  color: #bbff27;
  font-size: 11px;
  font-weight: 700;
}

.spot-toolbar {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) minmax(180px, 240px);
  align-items: center;
  gap: 10px;
}

.exchange-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 9px;
  background: var(--bg-soft);
}

.exchange-tab {
  padding: 8px 14px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.exchange-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
}

.symbol-search,
.symbol-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-size: 12px;
}

.ticker-strip {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.ticker-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}

.ticker-name div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ticker-name strong {
  font-size: 16px;
}

.ticker-name span,
.ticker-stat span {
  color: var(--text-secondary);
  font-size: 10px;
}

.ticker-price {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ticker-price strong {
  font-size: 24px;
  font-weight: 800;
}

.ticker-price span {
  font-size: 12px;
  font-weight: 700;
}

.ticker-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ticker-stat strong {
  font-size: 12px;
}

.spot-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

.chart-card {
  padding: 12px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.muted {
  color: var(--text-secondary);
  font-size: 12px;
}

.spot-table {
  margin-top: 4px;
}

.spot-table small {
  margin-left: 4px;
  color: var(--text-secondary);
  font-size: 10px;
}

.symbol-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.ghost-btn.small {
  padding: 5px 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.ghost-btn.small:hover {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.4);
}

.text-up {
  color: #4ade80;
}

.text-down {
  color: #f87171;
}

@media (max-width: 980px) {
  .spot-layout {
    grid-template-columns: 1fr;
  }

  .spot-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
