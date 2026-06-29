<template>
  <div class="page trade-page">
    <section class="trade-hero-grid">
      <section class="card hero-market-card">
        <div class="hero-head">
          <div>
            <div class="hero-eyebrow">{{ isPolymarket ? '预测市场' : '交易工作台' }}</div>
            <div class="hero-symbol-line">
              <h1 class="hero-symbol">{{ isPolymarket ? 'YES' : currentBaseSymbol }}</h1>
              <span class="hero-quote">/ {{ currentQuoteSymbol }}</span>
              <span :class="['hero-change', getTrendClass(currentTicker?.priceChangePercent24h)]">
                {{ isPolymarket ? formatProb(currentTicker?.lastPrice) : formatPercent(currentTicker?.priceChangePercent24h) }}
              </span>
            </div>
            <div v-if="isPolymarket && currentTicker?.question" class="hero-question">
              {{ currentTicker.question }}
            </div>
            <div class="hero-mode-text">{{ isPolymarket ? '概率市场' : `当前模式：${modeStore.modeLabel}` }}</div>
          </div>

          <div class="symbol-switches">
            <button
              :class="['exchange-chip', { active: marketStore.exchange === 'okx' }]"
              @click="switchExchange('okx')"
            >
              OKX
            </button>
            <button
              :class="['exchange-chip', { active: marketStore.exchange === 'binance' }]"
              @click="switchExchange('binance')"
            >
              Binance
            </button>
            <button
              :class="['exchange-chip', { active: marketStore.exchange === 'uniswap' }]"
              @click="switchExchange('uniswap')"
            >
              Uniswap
            </button>
            <button
              :class="['exchange-chip', { active: marketStore.exchange === 'polymarket' }]"
              @click="switchExchange('polymarket')"
            >
              Polymarket
            </button>
            <RouterLink
              v-for="item in symbolShortcuts"
              :key="item.symbol"
              :to="`/trade/${item.symbol}`"
              :class="['symbol-chip', { active: item.symbol === currentSymbol }]"
            >
              {{ item.symbol.split('-')[0] || item.symbol.replace('USDT', '') }}
            </RouterLink>
          </div>
        </div>

        <div class="hero-price-block">
          <div class="price-large">{{ isPolymarket ? formatProb(currentTicker?.lastPrice) : (currentTicker?.lastPrice || '--') }}</div>
          <div class="price-sub">
            {{ exchangeLabel }}
            · {{ isPolymarket ? `买价 ${formatProb(currentTicker?.bidPrice)}` : `卖一 ${currentTicker?.askPrice || '--'}` }}
            · {{ isPolymarket ? `卖价 ${formatProb(currentTicker?.askPrice)}` : `买一 ${currentTicker?.bidPrice || '--'}` }}
          </div>

          <div class="range-strip">
            <div class="range-header">
              <span>24H 区间</span>
              <span>{{ currentTicker?.low24h || '--' }} - {{ currentTicker?.high24h || '--' }}</span>
            </div>
            <div class="range-track">
              <div class="range-progress" :style="{ width: `${priceRangeProgress}%` }"></div>
            </div>
          </div>

          <div class="hero-stat-grid">
            <div class="hero-stat">
              <span>{{ isPolymarket ? '买价' : '买一' }}</span>
              <strong>{{ isPolymarket ? formatProb(currentTicker?.bidPrice) : (currentTicker?.bidPrice || '--') }}</strong>
            </div>
            <div class="hero-stat">
              <span>{{ isPolymarket ? '卖价' : '卖一' }}</span>
              <strong>{{ isPolymarket ? formatProb(currentTicker?.askPrice) : (currentTicker?.askPrice || '--') }}</strong>
            </div>
            <div class="hero-stat">
              <span>24H 成交量</span>
              <strong>{{ currentTicker?.volume24h || '--' }}</strong>
            </div>
            <div class="hero-stat">
              <span>活跃仓位</span>
              <strong>{{ positionStore.positions.length }}</strong>
            </div>
          </div>
        </div>
      </section>

      <OrderForm :symbol="currentSymbol" :kline-price="klineClickPrice" @submitted="handleOrderSubmitted" />
    </section>

    <KlineChart
      :klines="marketStore.klines"
      :loading="marketStore.chartLoading"
      :symbol="currentSymbol"
      :exchange="marketStore.exchange"
      v-model="klineInterval"
      @click-price="handleKlineClickPrice"
    />

    <section class="trade-panel-grid">
      <DepthPanel :asks="marketStore.depthAsks" :bids="marketStore.depthBids" :loading="marketStore.depthLoading" />

      <section class="card">
        <div class="panel-head">
          <h2 class="section-title">最近成交</h2>
          <span class="status-text">{{ marketStore.tradesLoading ? '同步中...' : '实时' }}</span>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>时间</th>
              <th>价格</th>
              <th>数量</th>
              <th>方向</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in marketStore.recentTrades" :key="`${item.ts}-${item.price}`">
              <td>{{ formatTradeTime(item.ts) }}</td>
              <td :class="item.side === 'buy' ? 'up' : 'down'">{{ item.price }}</td>
              <td>{{ item.qty }}</td>
              <td>{{ item.side === 'buy' ? '买入' : '卖出' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="!marketStore.recentTrades.length" class="empty-state">暂无成交数据</div>
      </section>

      <section class="card">
        <div class="panel-head">
          <h2 class="section-title">市场热度</h2>
          <span class="status-text">{{ exchangeLabel }}</span>
        </div>

        <RouterLink v-for="item in relatedTickers" :key="item.symbol" :to="`/trade/${item.symbol}`" class="watch-row">
          <div>
            <div class="watch-symbol">{{ item.symbol }}</div>
            <div class="watch-volume">24H 量 {{ item.volume24h }}</div>
          </div>
          <div class="watch-price-block">
            <strong>{{ item.lastPrice }}</strong>
            <span :class="getTrendClass(item.priceChangePercent24h)">{{ formatPercent(item.priceChangePercent24h) }}</span>
          </div>
        </RouterLink>

        <div class="risk-box">
          <div class="risk-title">交易风险提示</div>
          <div class="risk-copy">
            实盘前确认杠杆、止盈止损与 API 权限；高波动时优先使用限价单并关注强平价变化。
          </div>
        </div>
      </section>
    </section>

    <section class="trade-summary-row">
      <div class="card summary-card">
        <div class="stat-label">当前仓位名义价值</div>
        <div class="stat-value">{{ currentPosition?.notional || '--' }}</div>
        <div class="status-text">当前品种名义仓位</div>
      </div>
      <div class="card summary-card">
        <div class="stat-label">当前仓位保证金</div>
        <div class="stat-value">{{ currentPosition?.initialMargin || '--' }}</div>
        <div class="status-text">仓位开仓占用</div>
      </div>
      <div class="card summary-card">
        <div class="stat-label">维持保证金</div>
        <div class="stat-value">{{ currentPosition?.maintenanceMargin || '--' }}</div>
        <div class="status-text">风险预警阈值</div>
      </div>
      <div class="card summary-card">
        <div class="stat-label">浮动收益率</div>
        <div :class="['stat-value', getTrendClass(currentPosition?.roe)]">
          {{ currentPosition ? formatPercent(Number(currentPosition.roe) * 100) : '--' }}
        </div>
        <div class="status-text">按仓位 ROI 估算</div>
      </div>
    </section>

    <PositionsSummary :positions="positionStore.positions" :open-orders="orderStore.openOrders" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import DepthPanel from '../components/trade/DepthPanel.vue';
import KlineChart from '../components/trade/KlineChart.vue';
import OrderForm from '../components/trade/OrderForm.vue';
import PositionsSummary from '../components/trade/PositionsSummary.vue';
import { useMarketStore } from '../stores/market';
import { useModeStore } from '../stores/mode';
import { useOrderStore } from '../stores/orders';
import { usePositionStore } from '../stores/positions';
import { formatPercent, getTrendClass } from '../utils/format';

const props = defineProps<{ symbol?: string }>();

const marketStore = useMarketStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

const klineInterval = ref('5m');
const klineClickPrice = ref<number | null>(null);
const currentSymbol = computed(() => {
  const raw = props.symbol || 'BTC-USDT-SWAP';
  if (marketStore.exchange === 'uniswap') {
    return raw.replace('-SWAP', '');
  }
  return raw;
});
const currentTicker = computed(() => marketStore.tickerMap[currentSymbol.value] || null);
const currentPosition = computed(() => positionStore.positions[0] || null);
const currentBaseSymbol = computed(() => {
  const s = currentSymbol.value;
  if (s.includes('-')) return s.split('-')[0];
  return s.replace('USDT', '');
});
const currentQuoteSymbol = computed(() => {
  if (marketStore.exchange === 'polymarket') return 'USDC';
  return 'USDT';
});
const exchangeLabel = computed(() => {
  if (marketStore.exchange === 'okx') return 'OKX';
  if (marketStore.exchange === 'binance') return 'Binance';
  if (marketStore.exchange === 'uniswap') return 'Uniswap V3';
  return 'Polymarket';
});
const isPolymarket = computed(() => marketStore.exchange === 'polymarket');
const symbolShortcuts = computed(() => marketStore.symbols.slice(0, 5));
const relatedTickers = computed(() => {
  const source = marketStore.tickers.filter((item) => item.symbol !== currentSymbol.value);
  return source.length ? source.slice(0, 4) : marketStore.tickers.slice(0, 4);
});
const priceRangeProgress = computed(() => {
  const high = Number(currentTicker.value?.high24h || 0);
  const low = Number(currentTicker.value?.low24h || 0);
  const last = Number(currentTicker.value?.lastPrice || 0);

  if (!high || high <= low || !last) {
    return 50;
  }

  return Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
});

function formatTradeTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatProb(price: string | undefined | null): string {
  if (!price) return '--';
  const pct = Number(price) * 100;
  return `${pct.toFixed(1)}%`;
}

async function loadTradePageData() {
  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchTickers(),
    marketStore.fetchKlines(currentSymbol.value, klineInterval.value),
    positionStore.fetchPositions(modeStore.mode, currentSymbol.value),
    orderStore.fetchOpenOrders(modeStore.mode, currentSymbol.value),
  ]);
  initWs();
}

function initWs() {
  marketStore.connectWs(currentSymbol.value, klineInterval.value);
}

function handleKlineClickPrice(price: number) {
  klineClickPrice.value = price;
}

async function switchExchange(exch: 'okx' | 'binance' | 'uniswap' | 'polymarket') {
  marketStore.setExchange(exch);
  await loadTradePageData();
}

async function handleOrderSubmitted() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode, currentSymbol.value),
    orderStore.fetchOpenOrders(modeStore.mode, currentSymbol.value),
  ]);
}

watch(
  () => [props.symbol, modeStore.mode],
  () => {
    void loadTradePageData();
  },
  { immediate: true },
);

watch(klineInterval, () => {
  marketStore.disconnectWs();
  marketStore.fetchKlines(currentSymbol.value, klineInterval.value);
  initWs();
});

onBeforeUnmount(() => {
  marketStore.disconnectWs();
});
</script>

<style scoped>
.trade-page {
  gap: 18px;
}

.trade-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.95fr);
  gap: 16px;
  align-items: start;
}

.hero-market-card {
  padding: 22px;
}

.hero-head,
.hero-symbol-line,
.hero-stat-grid,
.trade-panel-grid,
.trade-summary-row,
.panel-head {
  display: grid;
  gap: 14px;
}

.hero-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.hero-eyebrow {
  color: var(--text-secondary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-symbol-line {
  grid-auto-flow: column;
  justify-content: start;
  align-items: end;
  gap: 10px;
  margin-top: 6px;
}

.hero-symbol {
  margin: 0;
  font-size: 38px;
  line-height: 1;
}

.hero-quote {
  color: var(--text-secondary);
  font-size: 22px;
  font-weight: 700;
}

.hero-change {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 15px;
  font-weight: 800;
}

.hero-mode-text {
  margin-top: 10px;
  color: var(--text-secondary);
}

.hero-question {
  margin-top: 10px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  max-width: 480px;
}

.symbol-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: end;
  align-items: center;
}

.exchange-chip {
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.exchange-chip.active {
  background: rgba(99, 255, 152, 0.14);
  border-color: var(--color-up);
  color: var(--color-up);
}

.exchange-chip:hover {
  opacity: 0.85;
}

.symbol-chip {
  padding: 9px 12px;
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-weight: 700;
}

.symbol-chip.active {
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
}

.price-large {
  font-size: clamp(34px, 5vw, 56px);
  font-weight: 900;
  line-height: 1;
}

.price-sub,
.range-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.price-sub {
  margin-top: 10px;
  flex-wrap: wrap;
  color: var(--text-secondary);
}

.range-strip {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

.range-header {
  color: var(--text-secondary);
  font-size: 13px;
}

.range-track {
  margin-top: 12px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.range-progress {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63ff98 0%, #bbff27 100%);
}

.hero-stat-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}

.hero-stat,
.summary-card {
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

.hero-stat span {
  color: var(--text-secondary);
  font-size: 13px;
}

.hero-stat strong {
  display: block;
  margin-top: 8px;
  font-size: 18px;
}

.trade-panel-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.panel-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  margin-bottom: 10px;
}

.watch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.watch-symbol {
  font-weight: 700;
}

.watch-volume {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.watch-price-block {
  display: grid;
  justify-items: end;
  gap: 5px;
}

.risk-box {
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(245, 166, 35, 0.12);
}

.risk-title {
  color: var(--color-warning);
  font-weight: 700;
}

.risk-copy {
  margin-top: 8px;
  color: var(--text-primary);
  line-height: 1.6;
}

.trade-summary-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 1200px) {
  .trade-hero-grid,
  .trade-panel-grid,
  .trade-summary-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-head,
  .hero-symbol-line {
    grid-template-columns: 1fr;
    grid-auto-flow: row;
  }

  .symbol-switches {
    justify-content: start;
  }

  .hero-stat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
