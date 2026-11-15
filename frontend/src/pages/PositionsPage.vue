<template>
  <div class="page">
    <h1 class="page-title">{{ $t('positions.pageTitle') }}</h1>

    <!-- 现货持仓：不占保证金、不加杠杆，单独成组展示 -->
    <section v-if="canSpot" class="card">
      <div class="section-head">
        <h2 class="section-title">{{ $t('spot.holdings') }}</h2>
        <span v-if="modeStore.overlayEnabled" class="status-text">{{ $t('settings.superOverlay') }}</span>
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
    <section v-else class="card">
      <h2 class="section-title">{{ $t('spot.holdings') }}</h2>
      <p class="status-text">{{ modeStore.reasonOf('spotHoldings') }}</p>
    </section>

    <!-- 预测市场持仓：与合约交易对分开成组，避免和永续持仓混在一起 -->
    <section v-if="canPrediction" class="card prediction-section">
      <div class="section-head">
        <div class="section-title-group">
          <h2 class="section-title">{{ $t('positions.predictionPositions') }}</h2>
          <span v-if="modeStore.overlayEnabled" class="status-text">{{ $t('settings.superOverlay') }}</span>
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
                  v-if="canPredictionTrade"
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
    <section v-else class="card">
      <h2 class="section-title">{{ $t('positions.predictionPositions') }}</h2>
      <p class="status-text">{{ modeStore.reasonOf('predictionPositions') }}</p>
    </section>

    <section v-if="canFutures" class="card">
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
            <th>{{ $t('positions.risk') }}</th>
            <th>{{ $t('positions.fundingFee') }}</th>
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
            <td>
              <span :class="['risk-badge', `risk-${riskLevelFromPosition(item)}`]">
                {{ $t(`risk.${riskLevelFromPosition(item)}`) }}
              </span>
            </td>
            <td :class="getTrendClass(item.fundingFee)">
              {{ item.fundingFee ? formatSignedValue(item.fundingFee, 4) : '--' }}
            </td>
            <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
            <td>
              <button v-if="canFuturesTrade" class="action-btn" :disabled="closingId === item.id" @click="handleClose(item)">
                {{ closingId === item.id ? '...' : $t('summary.close') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!livePositions.length" class="empty-state">{{ $t('positions.noData') }}</div>
      <div v-if="positionStore.error" class="status-text error-text">{{ positionStore.error }}</div>
    </section>
    <section v-else class="card">
      <h2 class="section-title">{{ $t('positions.currentPositions') }}</h2>
      <p class="status-text">{{ modeStore.reasonOf('futuresPositions') }}</p>
    </section>

    <section v-if="canOpenOrders" class="card">
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
              <button v-if="canFuturesTrade" class="action-btn" :disabled="cancellingId === item.orderId" @click="handleCancel(item)">
                {{ cancellingId === item.orderId ? '...' : $t('summary.cancel') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.openOrders.length" class="empty-state">{{ $t('positions.noOrders') }}</div>
      <div v-if="orderStore.error" class="status-text error-text">{{ orderStore.error }}</div>
      <div v-if="errorMessage" class="status-text error-text">{{ errorMessage }}</div>
    </section>
    <section v-else class="card">
      <h2 class="section-title">{{ $t('positions.openOrders') }}</h2>
      <p class="status-text">{{ modeStore.reasonOf('futuresOpenOrders') }}</p>
    </section>

    <section v-if="modeStore.mode === 'live'" class="card">
      <h2 class="section-title">实盘订单状态</h2>
      <table class="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>品种</th>
            <th>方向</th>
            <th>数量</th>
            <th>平台状态</th>
            <th>交易所状态</th>
            <th>一致性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in liveOrderStatus" :key="item.clientOrderId">
            <td>{{ item.clientOrderId }}</td>
            <td>{{ item.symbol }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? '多' : '空' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ formatOrderStatus(item.localStatus) }}</td>
            <td>{{ item.exchangeStatus ? formatOrderStatus(item.exchangeStatus) : '--' }}</td>
            <td>
              <span v-if="item.mismatch" class="error-text">不一致</span>
              <span v-else class="status-text">一致</span>
              <button class="ghost-btn small" type="button" @click="syncLiveOrder(item.clientOrderId)">同步</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!liveOrderStatus.length" class="empty-state">暂无实盘订单</div>
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
import { positionApi, orderApi } from '../api/services';
import type { LiveOrderStatusItem, OrderItem, PositionItem, PredictionPositionRecord } from '../api/types';
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
import { riskLevelFromPosition } from '../utils/risk';

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
const liveOrderStatus = ref<LiveOrderStatusItem[]>([]);

const canFutures = computed(() => modeStore.can('futuresPositions'));
const canOpenOrders = computed(() => modeStore.can('futuresOpenOrders'));
const canPrediction = computed(() => modeStore.can('predictionPositions'));
const canSpot = computed(() => modeStore.can('spotHoldings'));
const canFuturesTrade = computed(() => modeStore.can('futuresTrade'));
const canPredictionTrade = computed(() => modeStore.can('predictionTrade'));

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
  // 切模式时先清空，避免实盘接口失败后继续显示上一模式的模拟持仓。
  positionStore.positions = [];
  orderStore.openOrders = [];
  spotStore.holdings = [];
  predictionStore.positions = [];

  const tasks: Promise<unknown>[] = [assetStore.fetchAssets(modeStore.mode)];

  if (canFutures.value) {
    tasks.push(positionStore.fetchPositions(modeStore.mode));
  } else {
    positionStore.positions = [];
  }

  if (canOpenOrders.value) {
    tasks.push(orderStore.fetchOpenOrders(modeStore.mode));
  } else {
    orderStore.openOrders = [];
  }

  if (canSpot.value) {
    tasks.push(spotStore.fetchHoldings());
  } else {
    spotStore.holdings = [];
  }

  if (canPrediction.value) {
    tasks.push(predictionStore.fetchPositions());
  } else {
    predictionStore.positions = [];
  }

  liveOrderStatus.value = [];
  if (modeStore.mode === 'live' && canOpenOrders.value) {
    try {
      liveOrderStatus.value = (await orderApi.getLiveOrders()).list;
    } catch {
      liveOrderStatus.value = [];
    }
  }

  await Promise.all(tasks);
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

async function syncLiveOrder(clientOrderId: string) {
  try {
    const updated = await orderApi.syncLiveOrder(clientOrderId);
    const index = liveOrderStatus.value.findIndex((item) => item.clientOrderId === clientOrderId);
    if (index >= 0) liveOrderStatus.value[index] = updated;
  } catch (error) {
    errorMessage.value = (error as Error).message || '同步实盘订单失败';
  }
}

async function handleCancel(item: OrderItem) {
  if (cancellingId.value) return;
  cancellingId.value = item.orderId;
  errorMessage.value = '';
  const success = await orderStore.cancelOrder(item.orderId, modeStore.mode, item.symbol);
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
.risk-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
}

.risk-safe {
  color: var(--color-up);
  background: rgba(0, 200, 120, 0.12);
}

.risk-watch {
  color: #7db8ff;
  background: rgba(64, 158, 255, 0.12);
}

.risk-warning {
  color: var(--color-warning);
  background: rgba(245, 166, 35, 0.12);
}

.risk-danger {
  color: #ff6b6b;
  background: rgba(255, 70, 70, 0.14);
}

.risk-unknown {
  color: var(--text-secondary);
  background: var(--bg-soft);
}

</style>
