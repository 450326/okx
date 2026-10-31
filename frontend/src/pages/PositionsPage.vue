<template>
  <div class="page">
    <h1 class="page-title">{{ $t('positions.pageTitle') }}</h1>

    <!-- 现货持仓：不占保证金、不加杠杆，单独成组展示 -->
    <section class="card">
      <div class="section-head">
        <h2 class="section-title">{{ $t('spot.holdings') }}</h2>
        <div class="prediction-totals">
          <span>
            {{ $t('spot.currentValue') }}
            <strong>{{ formatCurrency(spotValue) }}</strong>
          </span>
          <span>
            {{ $t('spot.pnl') }}
            <strong :class="getTrendClass(spotPnl)">{{ formatSignedCurrency(spotPnl) }}</strong>
          </span>
        </div>
      </div>

      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>{{ $t('assets.symbol') }}</th>
              <th>{{ $t('spot.qty') }}</th>
              <th>{{ $t('spot.avgCost') }}</th>
              <th>{{ $t('spot.markPrice') }}</th>
              <th>{{ $t('spot.currentValue') }}</th>
              <th>{{ $t('spot.pnl') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in spotStore.holdings" :key="item.id">
              <td>
                <div class="symbol-cell">
                  <CoinIcon :symbol="item.symbol" :size="22" />
                  <span>{{ item.symbol.replace('-SWAP', '') }}</span>
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
                <RouterLink class="action-btn" :to="`/spot/${item.symbol}`">
                  {{ $t('spot.trade') }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!spotStore.holdings.length" class="empty-state">{{ $t('spot.noHoldings') }}</div>
    </section>

    <!-- 预测市场持仓：与合约交易对分开成组，避免和永续持仓混在一起 -->
    <section class="card prediction-section">
      <div class="section-head">
        <div class="section-title-group">
          <h2 class="section-title">{{ $t('positions.predictionPositions') }}</h2>
        </div>
        <div class="prediction-totals">
          <span>
            {{ $t('prediction.holdingsValue') }}
            <strong>{{ formatCurrency(predictionValue) }}</strong>
          </span>
          <span>
            {{ $t('prediction.holdingsPnl') }}
            <strong :class="getTrendClass(predictionPnl)">{{ formatSignedCurrency(predictionPnl) }}</strong>
          </span>
        </div>
      </div>
      <p class="status-text prediction-hint">{{ $t('positions.predictionPositionsHint') }}</p>

      <div class="table-scroll">
        <table class="table prediction-table">
          <thead>
            <tr>
              <th>{{ $t('positions.predictionMarket') }}</th>
              <th>{{ $t('prediction.outcome') }}</th>
              <th>{{ $t('positions.qty') }}</th>
              <th>{{ $t('positions.entryProbability') }}</th>
              <th>{{ $t('positions.markProbability') }}</th>
              <th>{{ $t('positions.currentValue') }}</th>
              <th>{{ $t('positions.pnl') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in predictionStore.positions" :key="item.id">
              <td>
                <RouterLink :to="`/prediction/${item.slug}`" class="prediction-market">
                  <span class="prediction-question">{{ item.question }}</span>
                  <span v-if="item.eventTitle" class="prediction-event">{{ item.eventTitle }}</span>
                </RouterLink>
              </td>
              <td>
                <span :class="['outcome-badge', item.outcome]">
                  {{ item.outcomeName || item.outcome.toUpperCase() }}
                </span>
              </td>
              <td>{{ item.qty }}</td>
              <td>{{ formatCents(item.entryPrice) }}</td>
              <td>{{ formatCents(item.markPrice) }}</td>
              <td>{{ formatCurrency(item.currentValue) }}</td>
              <td :class="getTrendClass(item.unrealizedPnl)">
                <div class="pnl-main">{{ formatSignedCurrency(item.unrealizedPnl) }}</div>
                <div class="pnl-sub">{{ formatRoe(item.roe) }}</div>
              </td>
              <td>
                <button
                  class="action-btn"
                  :disabled="closingPredictionId === item.id"
                  @click="handleClosePrediction(item)"
                >
                  {{ closingPredictionId === item.id ? '...' : $t('prediction.closePosition') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="predictionStore.positionsLoading && !predictionStore.positions.length" class="empty-state">
        {{ $t('common.loading') }}
      </div>
      <div v-else-if="!predictionStore.positions.length" class="empty-state">
        {{ $t('positions.noPredictionPositions') }}
      </div>
      <div v-if="predictionError" class="status-text error-text">{{ predictionError }}</div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('positions.currentPositions') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('positions.direction') }}</th>
            <th>{{ $t('positions.leverage') }}</th>
            <th>{{ $t('positions.qty') }}</th>
            <th>{{ $t('positions.entryPrice') }}</th>
            <th>{{ $t('positions.markPrice') }}</th>
            <th>{{ $t('positions.liquidationPrice') }}</th>
            <th>{{ $t('positions.pnl') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in livePositions" :key="item.id">
            <td>
              <div class="symbol-cell">
                <CoinIcon :symbol="item.symbol" :size="24" />
                <span>{{ item.symbol }}</span>
              </div>
            </td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('positions.long') : $t('positions.short') }}</td>
            <td>{{ item.leverage }}x</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.entryPrice }}</td>
            <td>{{ item.markPrice }}</td>
            <td>{{ item.liquidationPrice }}</td>
            <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
            <td>
              <button class="action-btn" :disabled="closingId === item.id" @click="handleClose(item)">
                {{ closingId === item.id ? '...' : $t('summary.close') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!livePositions.length" class="empty-state">{{ $t('positions.noData') }}</div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('positions.openOrders') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('positions.orderId') }}</th>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('positions.orderType') }}</th>
            <th>{{ $t('positions.direction') }}</th>
            <th>{{ $t('positions.price') }}</th>
            <th>{{ $t('positions.qty') }}</th>
            <th>{{ $t('positions.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in orderStore.openOrders" :key="item.orderId">
            <td>{{ formatOrderId(item.orderId) }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ item.orderType }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('positions.openLong') : $t('positions.openShort') }}</td>
            <td>{{ item.price || '--' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ formatOrderStatus(item.status) }}</td>
            <td>
              <button class="action-btn" :disabled="cancellingId === item.orderId" @click="handleCancel(item)">
                {{ cancellingId === item.orderId ? '...' : $t('summary.cancel') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.openOrders.length" class="empty-state">{{ $t('positions.noOrders') }}</div>
      <div v-if="errorMessage" class="status-text error-text">{{ errorMessage }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useModeStore } from '../stores/mode';
import { useMarketStore } from '../stores/market';
import { useOrderStore } from '../stores/orders';
import { usePositionStore } from '../stores/positions';
import { usePredictionStore } from '../stores/prediction';
import { useSpotStore } from '../stores/spot';
import { useAssetStore } from '../stores/assets';
import CoinIcon from '../components/common/CoinIcon.vue';
import { positionApi } from '../api/services';
import type { OrderItem, PositionItem, PredictionPositionRecord } from '../api/types';
import {
  formatCurrency,
  formatOrderId,
  formatOrderStatus,
  formatPercent,
  formatPrice,
  formatSignedCurrency,
  formatSignedValue,
  getTrendClass,
} from '../utils/format';
import { $t } from '../utils/i18n';

const modeStore = useModeStore();
const marketStore = useMarketStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();
const predictionStore = usePredictionStore();
const spotStore = useSpotStore();
const assetStore = useAssetStore();

const closingId = ref('');
const closingPredictionId = ref('');
const cancellingId = ref('');
const errorMessage = ref('');
const predictionError = ref('');

// 利用 WebSocket 实时行情重算持仓盈亏
const livePositions = computed(() =>
  positionStore.positions.map((p) => {
    const ticker = marketStore.tickerMap[p.symbol];
    if (!ticker) return p;
    const entry = Number(p.entryPrice);
    const mark = Number(ticker.markPrice || ticker.lastPrice);
    const qty = Number(p.qty);
    const pnl = p.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
    return {
      ...p,
      unrealizedPnl: pnl.toFixed(2),
      markPrice: ticker.markPrice || ticker.lastPrice,
      lastPrice: ticker.lastPrice,
    };
  }),
);

// 预测持仓总额只统计预测市场，不和合约持仓混算
const predictionValue = computed(() =>
  predictionStore.positions.reduce((sum, item) => sum + Number(item.currentValue || 0), 0),
);
const predictionPnl = computed(() =>
  predictionStore.positions.reduce((sum, item) => sum + Number(item.unrealizedPnl || 0), 0),
);

const spotValue = computed(() =>
  spotStore.holdings.reduce((sum, item) => sum + Number(item.currentValue || 0), 0),
);
const spotPnl = computed(() =>
  spotStore.holdings.reduce((sum, item) => sum + Number(item.unrealizedPnl || 0), 0),
);

function formatQty(value?: string | number): string {
  return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatSpotPrice(value?: string | number): string {
  const numeric = Number(value) || 0;
  const digits = numeric >= 1000 ? 2 : numeric >= 1 ? 4 : numeric >= 0.01 ? 6 : 8;
  return formatPrice(numeric, digits);
}

// 预测价格就是概率，0.635 显示为 63.5¢
function formatCents(value?: string | number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${(numeric * 100).toFixed(1)}¢`;
}

// 后端的 roe 是小数（0.2 表示 20%）
function formatRoe(value?: string | number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '--';
  return `${(numeric * 100).toFixed(2)}%`;
}

async function loadPageData() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchOpenOrders(modeStore.mode),
    assetStore.fetchAssets(modeStore.mode),
    spotStore.fetchHoldings(),
    predictionStore.fetchPositions(),
  ]);
}

async function handleClose(item: PositionItem) {
  if (closingId.value) return;
  closingId.value = item.id;
  errorMessage.value = '';
  try {
    await positionApi.closePosition(item.id, { symbol: item.symbol });
    await loadPageData();
  } catch (error) {
    errorMessage.value = (error as Error).message || '平仓失败';
  } finally {
    closingId.value = '';
  }
}

async function handleClosePrediction(item: PredictionPositionRecord) {
  if (closingPredictionId.value) return;
  closingPredictionId.value = item.id;
  predictionError.value = '';
  try {
    await predictionStore.closePosition(item.id);
    await assetStore.fetchAssets(modeStore.mode);
  } catch (error) {
    predictionError.value = (error as Error).message || '平仓失败';
  } finally {
    closingPredictionId.value = '';
  }
}

async function handleCancel(item: OrderItem) {
  if (cancellingId.value) return;
  cancellingId.value = item.orderId;
  errorMessage.value = '';
  const success = await orderStore.cancelOrder(item.orderId, modeStore.mode);
  if (success) {
    await loadPageData();
  } else {
    errorMessage.value = orderStore.error || '撤单失败';
  }
  cancellingId.value = '';
}

watch(
  () => modeStore.mode,
  () => {
    void loadPageData();
  },
  { immediate: true },
);
</script>

<style scoped>
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.section-title-group .section-title {
  margin-bottom: 0;
}

.prediction-totals {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 11px;
}

.prediction-totals strong {
  margin-left: 4px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.prediction-hint {
  margin: 4px 0 6px;
}

.table-scroll {
  overflow-x: auto;
}

.prediction-table {
  min-width: 760px;
}

.prediction-market {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--text-primary);
  text-decoration: none;
}

.prediction-market:hover .prediction-question {
  color: #bbff27;
}

.prediction-question {
  max-width: 360px;
  overflow: hidden;
  display: -webkit-box;
  font-weight: 600;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.prediction-event {
  max-width: 360px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outcome-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
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

.pnl-main {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pnl-sub {
  margin-top: 2px;
  font-size: 10px;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}

.symbol-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.action-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-down);
  border-radius: 999px;
  background: transparent;
  color: var(--color-down);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.action-btn:hover {
  background: rgba(246, 70, 93, 0.12);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.error-text {
  margin-top: 8px;
  color: var(--color-down);
}
</style>
