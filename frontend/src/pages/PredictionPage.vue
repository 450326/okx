<template>
  <div class="page prediction-page">
    <!-- 顶部概览：数据源、在架市场数、汇总成交量 -->
    <section class="card prediction-hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">
          <span class="live-dot"></span>
          {{ $t('prediction.live') }} · Polymarket
        </div>
        <h1 class="hero-title">{{ $t('prediction.title') }}</h1>
        <p class="hero-subtitle">{{ $t('prediction.subtitle') }}</p>

        <div class="hero-stats">
          <div class="hero-stat">
            <span>{{ $t('prediction.marketCount') }}</span>
            <strong>{{ store.total ?? store.markets.length }}</strong>
          </div>
          <div class="hero-stat">
            <span>{{ $t('prediction.volume24h') }}</span>
            <strong>{{ formatCompactVolume(store.totalVolume24h) }}</strong>
          </div>
          <div class="hero-stat">
            <span>{{ $t('prediction.liquidity') }}</span>
            <strong>{{ formatCompactVolume(store.totalLiquidity) }}</strong>
          </div>
        </div>
      </div>

      <div class="hero-badge">
        <div class="badge-ring">
          <strong>YES</strong>
          <span>/ NO</span>
        </div>
        <p>{{ $t('prediction.probability') }} = {{ $t('prediction.price') }}</p>
      </div>
    </section>

    <!-- 搜索、排序、刷新 -->
    <section class="card prediction-toolbar">
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input
          v-model="searchInput"
          class="search-input"
          type="search"
          :placeholder="$t('prediction.searchPlaceholder')"
          @input="handleSearchInput"
        />
        <button v-if="searchInput" class="search-clear" type="button" @click="clearSearch">✕</button>
      </div>

      <div class="sort-tabs">
        <button
          v-for="tab in sortTabs"
          :key="tab.value"
          :class="['sort-tab', { active: store.sort === tab.value }]"
          type="button"
          @click="store.setSort(tab.value)"
        >
          {{ $t(tab.labelKey) }}
        </button>
      </div>

      <button class="refresh-btn" type="button" :disabled="store.loading" @click="store.refresh()">
        ↻ {{ $t('prediction.refresh') }}
      </button>
    </section>

    <div v-if="store.error" class="error-banner">{{ store.error }}</div>

    <!-- 我的预测持仓：与合约模拟盘共用资金 -->
    <section v-if="store.positions.length" class="card prediction-positions">
      <div class="positions-head">
        <div>
          <h2 class="section-title">{{ $t('prediction.myPositions') }}</h2>
          <p class="positions-summary">{{ $t('prediction.myPositionsSummary') }}</p>
        </div>
        <div class="positions-totals">
          <div>
            <span>{{ $t('prediction.holdingsValue') }}</span>
            <strong>{{ formatCompactVolume(positionValue) }}</strong>
          </div>
          <div>
            <span>{{ $t('prediction.holdingsPnl') }}</span>
            <strong :class="getTrendClass(positionPnl)">{{ formatSignedCurrency(positionPnl) }}</strong>
          </div>
        </div>
      </div>

      <div v-if="store.tradeError" class="error-banner">{{ store.tradeError }}</div>

      <div class="position-grid">
        <div v-for="position in store.positions" :key="position.id" class="position-item">
          <div class="position-item-head">
            <span :class="['outcome-badge', position.outcome]">
              {{ position.outcome.toUpperCase() }}
            </span>
            <RouterLink :to="`/prediction/${position.slug}`" class="position-question">
              {{ position.question }}
            </RouterLink>
          </div>

          <div class="position-stats">
            <div>
              <span>{{ $t('prediction.qty') }}</span>
              <strong>{{ position.qty }}</strong>
            </div>
            <div>
              <span>{{ $t('prediction.avgPrice') }}</span>
              <strong>{{ formatCents(position.entryPrice) }}</strong>
            </div>
            <div>
              <span>{{ $t('prediction.markPrice') }}</span>
              <strong>{{ formatCents(position.markPrice) }}</strong>
            </div>
            <div>
              <span>{{ $t('prediction.pnl') }}</span>
              <strong :class="getTrendClass(position.unrealizedPnl)">
                {{ formatSignedCurrency(position.unrealizedPnl) }}
              </strong>
            </div>
          </div>

          <button
            class="ghost-btn position-close"
            type="button"
            :disabled="closingId === position.id || store.trading"
            @click="handleClose(position)"
          >
            {{ closingId === position.id ? $t('common.loading') : $t('prediction.closePosition') }}
          </button>
        </div>
      </div>
    </section>

    <!-- 首次加载骨架屏 -->
    <section v-if="store.loading && !store.markets.length" class="market-grid">
      <div v-for="index in 6" :key="index" class="card market-card skeleton-card">
        <div class="skeleton-line skeleton-icon"></div>
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-line skeleton-sub"></div>
        <div class="skeleton-line skeleton-bar"></div>
      </div>
    </section>

    <!-- 市场卡片 -->
    <section v-else-if="store.markets.length" class="market-grid">
      <RouterLink
        v-for="market in store.markets"
        :key="market.id"
        :to="`/prediction/${market.slug}`"
        class="card market-card"
      >
        <div class="market-top">
          <div class="market-icon">
            <span class="icon-fallback">{{ iconFallback(market) }}</span>
            <img
              v-if="market.icon"
              :src="market.icon"
              :alt="market.question"
              loading="lazy"
              @error="hideBrokenImage"
            />
          </div>
          <div class="market-heading">
            <div v-if="market.eventTitle" class="market-event">{{ market.eventTitle }}</div>
            <h3 class="market-question">{{ market.question }}</h3>
          </div>
        </div>

        <div class="probability-row">
          <div class="probability-main">
            <strong>{{ toPercent(market.yesPrice) }}<small>%</small></strong>
            <span>{{ $t('prediction.yes') }}</span>
          </div>
          <div :class="['probability-change', trendClass(market.change24h)]">
            {{ formatChange(market.change24h) }}
            <small>{{ $t('prediction.change24h') }}</small>
          </div>
        </div>

        <div class="probability-track">
          <div class="probability-fill" :style="{ width: `${toPercentNumber(market.yesPrice)}%` }"></div>
        </div>

        <div class="market-metrics">
          <div>
            <span>{{ $t('prediction.volume24h') }}</span>
            <strong>{{ formatCompactVolume(market.volume24h) }}</strong>
          </div>
          <div>
            <span>{{ $t('prediction.liquidity') }}</span>
            <strong>{{ formatCompactVolume(market.liquidity) }}</strong>
          </div>
        </div>

        <div class="market-footer">
          <span :class="['status-chip', market.closed ? 'closed' : 'active']">
            {{ market.closed ? $t('prediction.statusClosed') : $t('prediction.statusActive') }}
          </span>
          <span class="end-date">{{ $t('prediction.endsAt') }} {{ formatDate(market.endDate) }}</span>
        </div>
      </RouterLink>
    </section>

    <div v-else-if="!store.error" class="card empty-state">{{ $t('prediction.noMarkets') }}</div>

    <!-- 分页 / 最近更新时间 -->
    <div v-if="store.markets.length" class="list-footer">
      <button
        v-if="store.hasMore"
        class="ghost-btn load-more-btn"
        type="button"
        :disabled="store.loadingMore"
        @click="store.loadMore()"
      >
        {{ store.loadingMore ? $t('common.loading') : $t('prediction.loadMore') }}
      </button>
      <span v-else class="status-text">
        {{ $t('prediction.updatedAt') }} {{ updatedLabel }}
      </span>
    </div>

    <!-- 预测市场接口不可用时给出明确提示，而不是只显示空白列表 -->
    <div v-if="showUnavailableModal" class="prediction-modal-mask" @click.self="showUnavailableModal = false">
      <div class="prediction-modal card" role="alertdialog" aria-modal="true">
        <div class="prediction-modal-icon">!</div>
        <h2 class="section-title">{{ $t('prediction.unavailableTitle') }}</h2>
        <p class="prediction-modal-message">{{ store.error || $t('prediction.unavailableHint') }}</p>
        <p class="prediction-modal-hint status-text">{{ $t('prediction.unavailableHint') }}</p>
        <div class="prediction-modal-actions">
          <button class="ghost-btn" type="button" @click="showUnavailableModal = false">
            {{ $t('common.close') }}
          </button>
          <button class="primary-btn" type="button" :disabled="store.loading" @click="retryPrediction">
            {{ store.loading ? $t('common.loading') : $t('prediction.refresh') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { PredictionMarket, PredictionPositionRecord, PredictionSort } from '../api/types';
import { useAssetStore } from '../stores/assets';
import { useModeStore } from '../stores/mode';
import { usePredictionStore } from '../stores/prediction';
import { formatCompactVolume, formatSignedCurrency, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const store = usePredictionStore();
const assetStore = useAssetStore();
const modeStore = useModeStore();

const searchInput = ref(store.keyword);
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const closingId = ref('');
const showUnavailableModal = ref(false);

// 列表接口报错/上游不可用时弹出提示，避免用户只看到空白页面
watch(
  () => store.error,
  (error) => {
    showUnavailableModal.value = Boolean(error);
  },
  { immediate: true },
);

async function retryPrediction(): Promise<void> {
  showUnavailableModal.value = false;
  await store.fetchMarkets(true);
  if (!store.error) {
    await store.fetchPositions();
  }
}

const positionValue = computed(() =>
  store.positions.reduce((sum, position) => sum + Number(position.currentValue || 0), 0),
);
const positionPnl = computed(() =>
  store.positions.reduce((sum, position) => sum + Number(position.unrealizedPnl || 0), 0),
);

const sortTabs: { value: PredictionSort; labelKey: string }[] = [
  { value: 'volume', labelKey: 'prediction.sortVolume' },
  { value: 'liquidity', labelKey: 'prediction.sortLiquidity' },
  { value: 'ending', labelKey: 'prediction.sortEnding' },
  { value: 'newest', labelKey: 'prediction.sortNewest' },
];

const updatedLabel = computed(() => {
  if (!store.updatedAt) return '--';
  return new Date(store.updatedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
});

function toPercentNumber(price: number): number {
  return Math.round(price * 1000) / 10;
}

function toPercent(price: number): string {
  return toPercentNumber(price).toFixed(1);
}

// change24h 是概率变化（1 = 100 个百分点），统一显示成百分比
function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--';
  const percent = value * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function trendClass(value: number | null): string {
  if (value === null) return '';
  return getTrendClass(value);
}

function formatDate(value: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatCents(value?: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${(numeric * 100).toFixed(1)}¢`;
}

async function handleClose(position: PredictionPositionRecord): Promise<void> {
  if (closingId.value || store.trading) return;
  closingId.value = position.id;
  try {
    await store.closePosition(position.id);
    if (modeStore.mode === 'simulation') {
      await assetStore.fetchAssets('simulation');
    }
  } catch {
    // 错误已经保存在 store.tradeError，由详情页展示；列表页保留持仓即可。
  }
  closingId.value = '';
}

function iconFallback(market: PredictionMarket): string {
  const text = (market.eventTitle || market.question || '?').trim();
  return text.charAt(0).toUpperCase() || '?';
}

function hideBrokenImage(event: Event): void {
  const target = event.target as HTMLImageElement | null;
  if (target) target.style.display = 'none';
}

function handleSearchInput(): void {
  store.setKeyword(searchInput.value);
}

function clearSearch(): void {
  searchInput.value = '';
  store.setKeyword('');
}

onMounted(() => {
  void store.fetchMarkets(true);
  void store.fetchPositions();

  // 列表每分钟静默刷新一次，保持概率接近实时
  refreshTimer = setInterval(() => {
    if (
      document.visibilityState === 'visible' &&
      !store.loading &&
      !store.loadingMore &&
      store.markets.length <= 24
    ) {
      void store.refresh();
      void store.fetchPositions();
    }
  }, 60_000);
});

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<style scoped>
.prediction-page {
  gap: 16px;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
}

/* ===== 顶部概览 ===== */
.prediction-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at 90% -10%, rgba(187, 255, 39, 0.22), transparent 42%),
    linear-gradient(135deg, rgba(187, 255, 39, 0.08), transparent 55%),
    var(--bg-card);
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bbff27;
  box-shadow: 0 0 0 4px rgba(187, 255, 39, 0.14);
}

.hero-title {
  margin: 10px 0 0;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.1;
}

.hero-subtitle {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.hero-stats {
  display: flex;
  gap: 34px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.hero-stat {
  display: grid;
  gap: 5px;
}

.hero-stat span {
  color: var(--text-secondary);
  font-size: 11px;
}

.hero-stat strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.hero-badge {
  flex-shrink: 0;
  text-align: center;
}

.badge-ring {
  display: grid;
  place-items: center;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  border: 1px solid rgba(187, 255, 39, 0.4);
  background: radial-gradient(circle, rgba(187, 255, 39, 0.2), rgba(187, 255, 39, 0.02) 68%);
  box-shadow: inset 0 0 30px rgba(187, 255, 39, 0.1);
}

.badge-ring strong {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #bbff27;
}

.badge-ring span {
  margin-top: -18px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.hero-badge p {
  margin: 12px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
}

/* ===== 工具栏 ===== */
.prediction-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  flex-wrap: wrap;
  min-width: 0;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  min-width: 220px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-soft);
}

.search-icon {
  color: var(--text-secondary);
  font-size: 16px;
}

.search-input {
  flex: 1;
  padding: 9px 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  outline: none;
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-clear {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.sort-tabs {
  display: flex;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 4px;
  border-radius: 10px;
  background: var(--bg-soft);
  overflow-x: auto;
}

.sort-tab {
  padding: 7px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.12s ease;
}

.sort-tab.active {
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
}

.refresh-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-banner {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid rgba(246, 70, 93, 0.3);
  border-radius: 10px;
  background: rgba(246, 70, 93, 0.08);
  color: var(--color-down);
  font-size: 12px;
}

/* ===== 我的预测持仓 ===== */
.prediction-positions {
  display: grid;
  gap: 14px;
}

.positions-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.positions-summary {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
}

.positions-totals {
  display: flex;
  gap: 24px;
}

.positions-totals div {
  display: grid;
  gap: 3px;
}

.positions-totals span {
  color: var(--text-secondary);
  font-size: 10px;
}

.positions-totals strong {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.position-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.position-item {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-soft);
}

.position-item-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.outcome-badge {
  flex-shrink: 0;
  padding: 2px 7px;
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

.position-question {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.position-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.position-stats div {
  display: grid;
  gap: 2px;
}

.position-stats span {
  color: var(--text-secondary);
  font-size: 9px;
}

.position-stats strong {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.position-close {
  justify-self: start;
  padding: 5px 10px;
  font-size: 10px;
}

/* ===== 市场卡片 ===== */
.market-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.market-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.market-card:hover {
  border-color: rgba(187, 255, 39, 0.36);
  transform: translateY(-2px);
}

.market-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 60px;
}

.market-icon {
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  overflow: hidden;
  border-radius: 10px;
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
  font-size: 16px;
  font-weight: 800;
}

.market-heading {
  min-width: 0;
}

.market-event {
  margin-bottom: 4px;
  overflow: hidden;
  color: #bbff27;
  font-size: 10px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.market-question {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.probability-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}

.probability-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.probability-main strong {
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  color: #bbff27;
  font-variant-numeric: tabular-nums;
}

.probability-main strong small {
  margin-left: 2px;
  font-size: 13px;
  font-weight: 700;
}

.probability-main span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.probability-change {
  display: grid;
  justify-items: end;
  gap: 2px;
  font-size: 12px;
  font-weight: 800;
}

.probability-change small {
  color: var(--text-secondary);
  font-size: 9px;
  font-weight: 600;
}

.probability-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-soft);
}

.probability-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63ff98 0%, #bbff27 100%);
  transition: width 0.25s ease;
}

.market-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 9px 10px;
  border-radius: 9px;
  background: var(--bg-soft);
}

.market-metrics div {
  display: grid;
  gap: 3px;
}

.market-metrics span {
  color: var(--text-secondary);
  font-size: 10px;
}

.market-metrics strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.market-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.status-chip {
  padding: 3px 8px;
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

.end-date {
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

/* 骨架屏 */
.skeleton-card {
  min-height: 218px;
}

.skeleton-line {
  border-radius: 7px;
  background: linear-gradient(90deg, var(--bg-soft), rgba(139, 147, 166, 0.18), var(--bg-soft));
  background-size: 200% 100%;
  animation: skeleton 1.4s ease infinite;
}

.skeleton-icon {
  width: 42px;
  height: 42px;
}

.skeleton-title {
  width: 88%;
  height: 18px;
}

.skeleton-sub {
  width: 60%;
  height: 13px;
}

.skeleton-bar {
  width: 100%;
  height: 6px;
}

@keyframes skeleton {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

/* 底部 */
.list-footer {
  display: flex;
  justify-content: center;
  padding: 4px 0 8px;
}

.load-more-btn {
  min-width: 150px;
  padding: 10px 16px;
  font-size: 12px;
}

/* 响应式 */
@media (max-width: 1180px) {
  .market-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .position-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .prediction-hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 18px;
  }

  .hero-badge {
    display: none;
  }
}

@media (max-width: 760px) {
  .market-grid {
    grid-template-columns: 1fr;
  }

  .prediction-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .search-wrap {
    flex: none;
    width: 100%;
  }

  .sort-tabs {
    width: 100%;
  }

  .refresh-btn {
    align-self: flex-start;
  }

  .hero-stats {
    gap: 20px;
  }

  .positions-totals {
    gap: 16px;
  }

  .position-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 预测市场不可用提示弹窗 */
.prediction-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
}

.prediction-modal {
  width: min(440px, 100%);
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.prediction-modal-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: rgba(246, 70, 93, 0.15);
  color: var(--color-down);
  font-size: 24px;
  font-weight: 800;
}

.prediction-modal .section-title {
  margin-bottom: 8px;
}

.prediction-modal-message {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
}

.prediction-modal-hint {
  margin: 0 0 16px;
}

.prediction-modal-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
