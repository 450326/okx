<template>
  <div class="page prediction-detail-page">
    <div class="detail-topbar">
      <RouterLink to="/prediction" class="back-link">← {{ $t('prediction.back') }}</RouterLink>
      <div class="detail-actions">
        <span v-if="market" :class="['status-chip', market.closed ? 'closed' : 'active']">
          {{ market.closed ? $t('prediction.statusClosed') : $t('prediction.statusActive') }}
        </span>
        <button class="ghost-btn refresh-btn" type="button" :disabled="store.detailLoading" @click="refreshAll">
          ↻ {{ $t('prediction.refresh') }}
        </button>
      </div>
    </div>

    <section v-if="!market && !store.detailError" class="card detail-loading">
      {{ $t('common.loading') }}
    </section>

    <section v-else-if="!market" class="card detail-error">
      <h2 class="section-title">{{ $t('prediction.loadFailed') }}</h2>
      <p class="status-text">{{ store.detailError || $t('prediction.notFound') }}</p>
      <RouterLink class="primary-btn" to="/prediction">{{ $t('prediction.back') }}</RouterLink>
    </section>

    <template v-else-if="market">
      <!-- 市场标题 -->
      <section class="card market-header">
        <div class="market-icon">
          <span class="icon-fallback">{{ iconFallback }}</span>
          <img
            v-if="market.icon"
            :src="market.icon"
            :alt="market.question"
            loading="lazy"
            @error="hideBrokenImage"
          />
        </div>

        <div class="header-main">
          <div class="header-eyebrow">
            <span v-if="market.eventTitle">{{ market.eventTitle }}</span>
            <span v-if="market.eventTitle" class="dot">·</span>
            <span>{{ $t('prediction.endsAt') }} {{ formatDateTime(market.endDate) }}</span>
          </div>
          <h1 class="market-title">{{ market.question }}</h1>
          <div class="header-metrics">
            <span>{{ $t('prediction.volume24h') }} <strong>{{ formatCompactVolume(market.volume24h) }}</strong></span>
            <span>{{ $t('prediction.liquidity') }} <strong>{{ formatCompactVolume(market.liquidity) }}</strong></span>
            <span>{{ $t('prediction.totalVolume') }} <strong>{{ formatCompactVolume(market.volumeTotal) }}</strong></span>
          </div>
        </div>
      </section>

      <div class="detail-grid">
        <div class="detail-main">
          <!-- 概率与盘口摘要 -->
          <section class="card probability-card">
            <div class="prob-hero">
              <div class="prob-yes">
                <span>{{ $t('prediction.yes') }}</span>
                <strong>{{ toPercent(market.yesPrice) }}<small>%</small></strong>
              </div>
              <div :class="['prob-delta', trendClass(market.change24h)]">
                {{ formatChange(market.change24h) }}
                <small>{{ $t('prediction.change24h') }}</small>
              </div>
            </div>

            <div class="probability-track large">
              <div class="probability-fill" :style="{ width: `${toPercentNumber(market.yesPrice)}%` }"></div>
            </div>

            <div class="yesno-grid">
              <div class="yesno yes">
                <span>{{ $t('prediction.yes') }} · {{ market.outcomes[0]?.name || 'Yes' }}</span>
                <strong>{{ formatCents(market.yesPrice) }}</strong>
              </div>
              <div class="yesno no">
                <span>{{ $t('prediction.no') }} · {{ market.outcomes[1]?.name || 'No' }}</span>
                <strong>{{ formatCents(market.noPrice) }}</strong>
              </div>
            </div>

            <div class="quote-grid">
              <div>
                <span>{{ $t('prediction.bestBid') }}</span>
                <strong>{{ formatCents(market.bestBid) }}</strong>
              </div>
              <div>
                <span>{{ $t('prediction.bestAsk') }}</span>
                <strong>{{ formatCents(market.bestAsk) }}</strong>
              </div>
              <div>
                <span>{{ $t('prediction.spread') }}</span>
                <strong>{{ formatCents(market.spread) }}</strong>
              </div>
            </div>
          </section>

          <!-- 概率走势 -->
          <section class="card chart-card">
            <div class="card-head">
              <h2 class="section-title">{{ $t('prediction.chartTitle') }}</h2>
              <div class="interval-tabs">
                <button
                  v-for="item in intervals"
                  :key="item.value"
                  :class="['interval-tab', { active: store.historyInterval === item.value }]"
                  type="button"
                  @click="changeInterval(item.value)"
                >
                  {{ $t(item.labelKey) }}
                </button>
              </div>
            </div>
            <ProbabilityChart :points="store.history" :loading="store.historyLoading" />
          </section>

          <!-- 最近成交 -->
          <section class="card trades-card">
            <div class="card-head">
              <h2 class="section-title">{{ $t('prediction.trades') }}</h2>
              <span class="status-text">
                {{ store.tradesLoading ? $t('common.loading') : $t('prediction.live') }}
              </span>
            </div>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ $t('prediction.time') }}</th>
                    <th>{{ $t('prediction.outcome') }}</th>
                    <th>{{ $t('prediction.side') }}</th>
                    <th>{{ $t('prediction.price') }}</th>
                    <th>{{ $t('prediction.size') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="trade in visibleTrades" :key="trade.id">
                    <td class="time-cell">{{ formatTime(trade.ts) }}</td>
                    <td>{{ trade.outcome }}</td>
                    <td :class="trade.side === 'buy' ? 'up' : 'down'">
                      {{ trade.side === 'buy' ? $t('prediction.buy') : $t('prediction.sell') }}
                    </td>
                    <td>{{ formatCents(trade.price) }}</td>
                    <td>{{ formatNumber(trade.size) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!store.trades.length" class="empty-state">{{ $t('common.noData') }}</div>
          </section>
        </div>

        <aside class="detail-side">
          <!-- 模拟交易：与合约模拟盘共用同一份钱包 -->
          <section class="card trade-card">
            <div class="card-head">
              <h2 class="section-title">{{ $t('prediction.tradeTitle') }}</h2>
            </div>

            <div class="trade-action-tabs">
              <button
                :class="['trade-action-tab', { active: tradeAction === 'buy' }]"
                type="button"
                @click="setTradeAction('buy')"
              >
                {{ $t('prediction.buy') }}
              </button>
              <button
                :class="['trade-action-tab', { active: tradeAction === 'sell' }]"
                type="button"
                @click="setTradeAction('sell')"
              >
                {{ $t('prediction.sell') }}
              </button>
            </div>

            <div class="outcome-tabs">
              <button
                :class="['outcome-tab', { active: tradeOutcome === 'yes' }]"
                type="button"
                @click="setTradeOutcome('yes')"
              >
                <span>{{ $t('prediction.yes') }}</span>
                <strong>{{ formatCents(market.yesPrice) }}</strong>
              </button>
              <button
                :class="['outcome-tab', { active: tradeOutcome === 'no' }]"
                type="button"
                @click="setTradeOutcome('no')"
              >
                <span>{{ $t('prediction.no') }}</span>
                <strong>{{ formatCents(market.noPrice) }}</strong>
              </button>
            </div>

            <div class="trade-meta">
              <span>
                {{ $t('prediction.available') }}
                <strong>{{ formatCurrency(assetStore.snapshot?.availableBalance) }}</strong>
              </span>
              <span v-if="selectedPosition">
                {{ $t('prediction.position') }}
                <strong>{{ selectedPosition.qty }}</strong>
              </span>
            </div>

            <label class="field trade-field">
              <span>{{ $t('prediction.qty') }}</span>
              <div class="qty-input">
                <input
                  v-model="tradeQty"
                  type="number"
                  min="1"
                  step="1"
                  inputmode="decimal"
                  placeholder="1"
                />
                <button type="button" @click="setMaxQty">{{ $t('prediction.max') }}</button>
              </div>
            </label>

            <div class="quick-amounts">
              <button
                v-for="amount in quickAmounts"
                :key="amount"
                type="button"
                @click="tradeQty = String(amount)"
              >
                {{ amount }}
              </button>
            </div>

            <div class="trade-summary">
              <div>
                <span>
                  {{ tradeAction === 'buy' ? $t('prediction.estimatedCost') : $t('prediction.estimatedProceeds') }}
                </span>
                <strong>{{ formatCurrency(estimate) }}</strong>
              </div>
              <div>
                <span>{{ $t('prediction.price') }}</span>
                <strong>{{ formatCents(tradePrice) }}</strong>
              </div>
            </div>

            <button
              class="primary-btn trade-submit"
              type="button"
              :disabled="!canSubmit"
              @click="submitTrade"
            >
              {{ tradeAction === 'buy' ? $t('prediction.buy') : $t('prediction.sell') }}
              {{ tradeOutcome.toUpperCase() }}
            </button>

            <p v-if="market.closed" class="trade-warning">{{ $t('prediction.closedMarket') }}</p>
            <p v-if="store.tradeError" class="trade-error">{{ store.tradeError }}</p>
            <p v-else-if="tradeSuccess" class="trade-success">{{ $t('prediction.orderFilled') }}</p>

            <div v-if="marketPositions.length" class="trade-positions">
              <div v-for="position in marketPositions" :key="position.id" class="trade-position">
                <span :class="['outcome-badge', position.outcome]">
                  {{ position.outcome.toUpperCase() }}
                </span>
                <span>{{ position.qty }} @ {{ formatCents(position.entryPrice) }}</span>
                <strong :class="getTrendClass(position.unrealizedPnl)">
                  {{ formatSignedCurrency(position.unrealizedPnl) }}
                </strong>
                <button type="button" @click="closeMarketPosition(position)">
                  {{ $t('prediction.closePosition') }}
                </button>
              </div>
            </div>
          </section>

          <!-- 我在该市场的成交 -->
          <section v-if="marketOrders.length" class="card trade-orders-card">
            <div class="card-head">
              <h2 class="section-title">{{ $t('prediction.myOrders') }}</h2>
              <span class="status-text">{{ marketOrders.length }}</span>
            </div>
            <div v-for="order in marketOrders.slice(0, 6)" :key="order.orderId" class="trade-order-row">
              <span :class="['outcome-badge', order.outcome]">{{ order.outcome.toUpperCase() }}</span>
              <span>{{ order.action === 'buy' ? $t('prediction.buy') : $t('prediction.sell') }}</span>
              <span>{{ order.qty }} @ {{ formatCents(order.price) }}</span>
              <span class="trade-order-time">{{ formatTime(new Date(order.createdAt).getTime()) }}</span>
            </div>
          </section>

          <!-- 订单簿 -->
          <section class="card book-card">
            <div class="card-head">
              <h2 class="section-title">{{ $t('prediction.orderBook') }}</h2>
              <span class="status-text">YES</span>
            </div>

            <div class="book-head">
              <span>{{ $t('prediction.price') }}</span>
              <span>{{ $t('prediction.size') }}</span>
            </div>

            <div class="book-list asks">
              <div v-for="(level, index) in asksView" :key="`ask-${index}`" class="book-row ask">
                <span>{{ formatCents(level.price) }}</span>
                <span>{{ formatNumber(level.size) }}</span>
              </div>
            </div>

            <div class="book-mid">
              <span>{{ $t('prediction.midpoint') }}</span>
              <strong>{{ formatCents(book?.midpoint ?? null) }}</strong>
            </div>

            <div class="book-list bids">
              <div v-for="(level, index) in bidsView" :key="`bid-${index}`" class="book-row bid">
                <span>{{ formatCents(level.price) }}</span>
                <span>{{ formatNumber(level.size) }}</span>
              </div>
            </div>

            <div v-if="!asksView.length && !bidsView.length" class="empty-state">
              {{ $t('common.noData') }}
            </div>
          </section>

          <!-- 市场信息 -->
          <section class="card about-card">
            <h2 class="section-title">{{ $t('prediction.about') }}</h2>
            <p class="description">{{ market.description || $t('prediction.noDescription') }}</p>

            <div class="info-list">
              <div class="info-row">
                <span>{{ $t('prediction.event') }}</span>
                <strong>{{ market.eventTitle || '--' }}</strong>
              </div>
              <div class="info-row">
                <span>{{ $t('prediction.startDate') }}</span>
                <strong>{{ formatDateTime(market.startDate) }}</strong>
              </div>
              <div class="info-row">
                <span>{{ $t('prediction.endDate') }}</span>
                <strong>{{ formatDateTime(market.endDate) }}</strong>
              </div>
              <div class="info-row">
                <span>{{ $t('prediction.resolutionSource') }}</span>
                <strong>
                  <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noreferrer noopener">
                    {{ sourceHost }}
                  </a>
                  <template v-else>--</template>
                </strong>
              </div>
            </div>
          </section>

          <!-- 相关市场 -->
          <section v-if="related.length" class="card related-card">
            <h2 class="section-title">{{ $t('prediction.related') }}</h2>
            <RouterLink
              v-for="item in related"
              :key="item.id"
              :to="`/prediction/${item.slug}`"
              class="related-row"
            >
              <div class="related-main">
                <strong>{{ item.question }}</strong>
                <span>{{ $t('prediction.endsAt') }} {{ formatDate(item.endDate) }}</span>
              </div>
              <div class="related-prob">{{ toPercent(item.yesPrice) }}%</div>
            </RouterLink>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import ProbabilityChart from '../components/prediction/ProbabilityChart.vue';
import type { PredictionHistoryInterval, PredictionPositionRecord } from '../api/types';
import { useAssetStore } from '../stores/assets';
import { useModeStore } from '../stores/mode';
import { usePredictionStore } from '../stores/prediction';
import {
  formatCompactVolume,
  formatCurrency,
  formatSignedCurrency,
  getTrendClass,
} from '../utils/format';
import { $t } from '../utils/i18n';

const props = defineProps<{ slug: string }>();
const store = usePredictionStore();
const assetStore = useAssetStore();
const modeStore = useModeStore();

const intervals: { value: PredictionHistoryInterval; labelKey: string }[] = [
  { value: '1d', labelKey: 'prediction.interval1d' },
  { value: '1w', labelKey: 'prediction.interval1w' },
  { value: '1m', labelKey: 'prediction.interval1m' },
  { value: 'max', labelKey: 'prediction.intervalMax' },
];

const market = computed(() => store.detail?.market ?? null);
const book = computed(() => store.orderBook);
const related = computed(() => store.detail?.related ?? []);
const asksView = computed(() => [...(store.orderBook?.asks ?? [])].slice(0, 8).reverse());
const bidsView = computed(() => (store.orderBook?.bids ?? []).slice(0, 8));
const visibleTrades = computed(() => store.trades.slice(0, 12));

// ---------- 模拟交易 ----------
const tradeAction = ref<'buy' | 'sell'>('buy');
const tradeOutcome = ref<'yes' | 'no'>('yes');
const tradeQty = ref('');
const tradeSuccess = ref(false);
const quickAmounts = [10, 50, 100, 500];

const tradePrice = computed(() => {
  const current = market.value;
  if (!current) return 0;
  if (tradeOutcome.value === 'yes') {
    return tradeAction.value === 'buy'
      ? current.bestAsk ?? current.yesPrice
      : current.bestBid ?? current.yesPrice;
  }
  const noPrice = current.noPrice ?? Math.max(0, 1 - current.yesPrice);
  const noAsk = current.bestBid != null ? 1 - current.bestBid : noPrice;
  const noBid = current.bestAsk != null ? 1 - current.bestAsk : noPrice;
  return tradeAction.value === 'buy' ? noAsk : noBid;
});

const tradeQtyNumber = computed(() => Number(tradeQty.value));
const estimate = computed(() =>
  Number.isFinite(tradeQtyNumber.value) && tradeQtyNumber.value > 0
    ? tradeQtyNumber.value * tradePrice.value
    : 0,
);

const selectedPosition = computed(
  () =>
    store.positions.find(
      (position) =>
        position.slug === props.slug && position.outcome === tradeOutcome.value,
    ) ?? null,
);
const marketPositions = computed(() =>
  store.positions.filter((position) => position.slug === props.slug),
);
const marketOrders = computed(() =>
  store.orders.filter((order) => order.slug === props.slug),
);

const maxQty = computed(() => {
  if (tradeAction.value === 'sell') {
    return Math.floor(Number(selectedPosition.value?.qty || 0));
  }
  const available = Number(assetStore.snapshot?.availableBalance || 0);
  return tradePrice.value > 0 ? Math.floor(available / tradePrice.value) : 0;
});

const canSubmit = computed(() => {
  if (!market.value) return false;
  if (tradeAction.value === 'buy' && market.value.closed) return false;
  const qty = tradeQtyNumber.value;
  if (!Number.isFinite(qty) || qty <= 0) return false;
  if (tradeAction.value === 'buy') {
    return estimate.value <= Number(assetStore.snapshot?.availableBalance || 0) + 1e-9;
  }
  return !!selectedPosition.value && qty <= Number(selectedPosition.value.qty) + 1e-9;
});

const iconFallback = computed(() => {
  const text = (market.value?.eventTitle || market.value?.question || '?').trim();
  return text.charAt(0).toUpperCase() || '?';
});

const sourceUrl = computed(() => {
  const value = market.value?.resolutionSource || '';
  return /^https?:\/\//i.test(value) ? value : '';
});

const sourceHost = computed(() => {
  if (!sourceUrl.value) return '';
  try {
    return new URL(sourceUrl.value).host;
  } catch {
    return sourceUrl.value;
  }
});

function toPercentNumber(price: number): number {
  return Math.round(price * 1000) / 10;
}

function toPercent(price: number): string {
  return toPercentNumber(price).toFixed(1);
}

// 概率变化，1 表示 100 个百分点
function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const percent = value * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function trendClass(value: number | null): string {
  if (value === null) return '';
  return getTrendClass(value);
}

// 概率价格转成分（0.795 -> 79.5¢）
function formatCents(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '--';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${(numeric * 100).toFixed(1)}¢`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '--';
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(ts: number): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function hideBrokenImage(event: Event): void {
  const target = event.target as HTMLImageElement | null;
  if (target) target.style.display = 'none';
}

function changeInterval(interval: PredictionHistoryInterval): void {
  if (store.historyInterval === interval) return;
  void store.fetchHistory(props.slug, interval);
}

// ---------- 模拟交易动作 ----------

function setTradeAction(action: 'buy' | 'sell'): void {
  tradeAction.value = action;
  tradeQty.value = '';
  tradeSuccess.value = false;
  store.clearTradeError();
}

function setTradeOutcome(outcome: 'yes' | 'no'): void {
  tradeOutcome.value = outcome;
  tradeQty.value = '';
  tradeSuccess.value = false;
  store.clearTradeError();
}

function setMaxQty(): void {
  if (maxQty.value > 0) tradeQty.value = String(maxQty.value);
}

async function submitTrade(): Promise<void> {
  if (!canSubmit.value || store.trading) return;
  store.clearTradeError();
  tradeSuccess.value = false;
  try {
    await store.placeOrder({
      slug: props.slug,
      outcome: tradeOutcome.value,
      action: tradeAction.value,
      qty: String(tradeQtyNumber.value),
    });
    await assetStore.fetchAssets(modeStore.mode);
    tradeSuccess.value = true;
    tradeQty.value = '';
  } catch {
    // 错误由 store.tradeError 展示
  }
}

async function closeMarketPosition(position: PredictionPositionRecord): Promise<void> {
  if (store.trading) return;
  store.clearTradeError();
  try {
    await store.closePosition(position.id);
    await Promise.all([assetStore.fetchAssets(modeStore.mode), store.fetchOrders(props.slug)]);
    tradeSuccess.value = true;
  } catch {
    // 错误由 store.tradeError 展示
  }
}

async function loadMarket(slug: string): Promise<void> {
  store.clearDetail();
  tradeQty.value = '';
  tradeSuccess.value = false;
  tradeAction.value = 'buy';
  tradeOutcome.value = 'yes';
  store.clearTradeError();
  await Promise.all([
    store.fetchDetail(slug),
    store.fetchHistory(slug, '1w'),
    store.fetchOrderBook(slug),
    store.fetchTrades(slug),
    store.fetchPositions(),
    store.fetchOrders(slug),
  ]);
}

async function refreshAll(): Promise<void> {
  await Promise.all([
    store.fetchDetail(props.slug),
    store.fetchHistory(props.slug, store.historyInterval),
    store.fetchOrderBook(props.slug),
    store.fetchTrades(props.slug),
  ]);
}

// 盘口和成交每 10 秒刷新一次，减少手动刷新
let pollTimer: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  stopPolling();
  pollTimer = setInterval(() => {
    void store.fetchOrderBook(props.slug);
    void store.fetchTrades(props.slug);
    void store.fetchPositions();
  }, 10_000);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

watch(
  () => props.slug,
  (slug) => {
    if (!slug) return;
    void loadMarket(slug);
  },
);

onMounted(() => {
  void loadMarket(props.slug);
  startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
  store.clearDetail();
});
</script>

<style scoped>
.prediction-detail-page {
  gap: 14px;
}

.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.back-link {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.back-link:hover {
  color: #bbff27;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn {
  padding: 7px 12px;
  font-size: 12px;
}

.status-chip {
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.status-chip.active {
  background: rgba(0, 192, 135, 0.14);
  color: var(--color-up);
}

.status-chip.closed {
  background: var(--bg-soft);
  color: var(--text-secondary);
}

.detail-loading,
.detail-error {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 240px;
  color: var(--text-secondary);
}

.detail-error .primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 标题 */
.market-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.market-icon {
  position: relative;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: linear-gradient(135deg, rgba(187, 255, 39, 0.2), rgba(59, 130, 246, 0.2));
}

.market-icon img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 800;
}

.header-main {
  min-width: 0;
}

.header-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.header-eyebrow .dot {
  opacity: 0.5;
}

.market-title {
  margin: 8px 0 0;
  font-size: clamp(19px, 2.4vw, 26px);
  line-height: 1.35;
}

.header-metrics {
  display: flex;
  gap: 18px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 11px;
  flex-wrap: wrap;
}

.header-metrics strong {
  margin-left: 4px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* 布局 */
.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.9fr);
  gap: 14px;
  align-items: start;
}

.detail-main,
.detail-side {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-head .section-title {
  margin-bottom: 0;
}

/* 概率卡 */
.prob-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.prob-yes {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.prob-yes span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.prob-yes strong {
  color: #bbff27;
  font-size: clamp(40px, 5vw, 56px);
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.prob-yes strong small {
  margin-left: 3px;
  font-size: 18px;
}

.prob-delta {
  display: grid;
  justify-items: end;
  gap: 3px;
  font-size: 14px;
  font-weight: 800;
}

.prob-delta small {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
}

.probability-track {
  height: 6px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-soft);
}

.probability-track.large {
  height: 9px;
}

.probability-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63ff98 0%, #bbff27 100%);
  transition: width 0.25s ease;
}

.yesno-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.yesno {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.yesno span {
  font-size: 11px;
  font-weight: 700;
}

.yesno strong {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.yesno.yes {
  border-color: rgba(0, 192, 135, 0.28);
  background: rgba(0, 192, 135, 0.08);
  color: var(--color-up);
}

.yesno.no {
  border-color: rgba(246, 70, 93, 0.26);
  background: rgba(246, 70, 93, 0.07);
  color: var(--color-down);
}

.quote-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.quote-grid div {
  display: grid;
  gap: 4px;
}

.quote-grid span {
  color: var(--text-secondary);
  font-size: 10px;
}

.quote-grid strong {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

/* 图表 */
.interval-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: var(--bg-soft);
}

.interval-tab {
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.interval-tab.active {
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
}

.chart-card {
  padding: 16px;
}

/* 成交表 */
.trades-card {
  min-width: 0;
}

.table-scroll {
  overflow-x: auto;
}

.time-cell {
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

/* 模拟交易 */
.trade-card {
  display: grid;
  gap: 0;
}

.trade-action-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-top: 12px;
  padding: 4px;
  border-radius: 10px;
  background: var(--bg-soft);
}

.trade-action-tab {
  padding: 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.trade-action-tab.active {
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
}

.outcome-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.outcome-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.outcome-tab strong {
  color: var(--text-primary);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.outcome-tab.active {
  border-color: rgba(187, 255, 39, 0.42);
  background: rgba(187, 255, 39, 0.08);
  color: #bbff27;
}

.outcome-tab.active strong {
  color: #bbff27;
}

.trade-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 10px;
  flex-wrap: wrap;
}

.trade-meta strong {
  margin-left: 3px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.trade-field {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.trade-field > span {
  color: var(--text-secondary);
  font-size: 10px;
}

.qty-input {
  display: flex;
  gap: 6px;
}

.qty-input input {
  flex: 1;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-primary);
  outline: none;
}

.qty-input button {
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.quick-amounts {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.quick-amounts button {
  flex: 1;
  padding: 6px 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.trade-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--bg-soft);
}

.trade-summary div {
  display: grid;
  gap: 2px;
}

.trade-summary span {
  color: var(--text-secondary);
  font-size: 9px;
}

.trade-summary strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.trade-submit {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  border: none;
  border-radius: 9px;
  font-size: 12px;
}

.trade-warning,
.trade-error,
.trade-success {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.5;
}

.trade-warning {
  color: var(--color-warning);
}

.trade-error {
  color: var(--color-down);
}

.trade-success {
  color: var(--color-up);
}

.trade-positions {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.trade-position {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 10px;
}

.trade-position strong {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.trade-position button {
  border: none;
  background: transparent;
  color: var(--color-down);
  font-size: 10px;
  cursor: pointer;
}

.trade-orders-card .trade-order-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 10px;
}

.trade-order-row:last-child {
  border-bottom: none;
}

.trade-order-time {
  margin-left: auto;
  white-space: nowrap;
}

.outcome-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.outcome-badge.yes {
  background: rgba(0, 192, 135, 0.16);
  color: var(--color-up);
}

.outcome-badge.no {
  background: rgba(246, 70, 93, 0.14);
  color: var(--color-down);
}

/* 订单簿 */
.book-head,
.book-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.book-head {
  margin-top: 12px;
  padding: 0 8px 6px;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
}

.book-head span:last-child,
.book-row span:last-child {
  text-align: right;
}

.book-list {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
}

.book-row {
  padding: 5px 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.book-row.ask {
  background: rgba(246, 70, 93, 0.07);
  color: var(--color-down);
}

.book-row.bid {
  background: rgba(0, 192, 135, 0.07);
  color: var(--color-up);
}

.book-mid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 0;
  padding: 7px 8px;
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 10px;
}

.book-mid strong {
  color: var(--text-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 市场信息 */
.description {
  margin: 0 0 14px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-line;
}

.info-list {
  display: grid;
  gap: 9px;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
}

.info-row span {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.info-row strong {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-row a {
  color: #60a5fa;
}

/* 相关市场 */
.related-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.related-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.related-main {
  min-width: 0;
}

.related-main strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.related-main span {
  display: block;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 10px;
}

.related-prob {
  flex-shrink: 0;
  color: #bbff27;
  font-size: 14px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1180px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  /* 单列时把交易卡排到最前，避免手机端先看到图表再滑很久才到下单 */
  .detail-main,
  .detail-side {
    display: contents;
  }

  .trade-card {
    order: 1;
  }

  .probability-card {
    order: 2;
  }

  .chart-card {
    order: 3;
  }

  .trade-orders-card {
    order: 4;
  }

  .book-card {
    order: 5;
  }

  .trades-card {
    order: 6;
  }

  .about-card {
    order: 7;
  }

  .related-card {
    order: 8;
  }
}

@media (max-width: 860px) {
  .market-header {
    gap: 12px;
  }

  .yesno-grid {
    grid-template-columns: 1fr;
  }
}
</style>
