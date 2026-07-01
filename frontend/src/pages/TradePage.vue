<template>
  <!-- 交易页面容器 -->
  <div class="page trade-page">
    <!-- 顶部行情 + 下单区域 -->
    <section class="trade-hero-grid">
      <!-- 行情信息卡片 -->
      <section class="card hero-market-card">
        <div class="hero-head">
          <div>
            <!-- 工作台标题 -->
            <div class="hero-eyebrow">{{ isPolymarket ? $t('trade.predictionMarket') : $t('trade.workbench') }}</div>
            <!-- 品种名称及涨跌幅 -->
            <div class="hero-symbol-line">
              <h1 class="hero-symbol">{{ isPolymarket ? 'YES' : currentBaseSymbol }}</h1>
              <span class="hero-quote">/ {{ currentQuoteSymbol }}</span>
              <span :class="['hero-change', getTrendClass(currentTicker?.priceChangePercent24h)]">
                {{ isPolymarket ? formatProb(currentTicker?.lastPrice) : formatPercent(currentTicker?.priceChangePercent24h) }}
              </span>
            </div>
            <!-- Polymarket 问题描述 -->
            <div v-if="isPolymarket && currentTicker?.question" class="hero-question">
              {{ currentTicker.question }}
            </div>
            <div class="hero-mode-text">{{ isPolymarket ? $t('trade.probabilityMarket') : `${$t('trade.currentMode')}：${modeStore.modeLabel}` }}</div>
          </div>

          <!-- 交易所 / 品种切换 -->
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

        <!-- 价格展示区 -->
        <div class="hero-price-block">
          <div class="price-large">{{ isPolymarket ? formatProb(currentTicker?.lastPrice) : (currentTicker?.lastPrice || '--') }}</div>
          <div class="price-sub">
            {{ exchangeLabel }}
            · {{ isPolymarket ? `${$t('trade.bidPrice')} ${formatProb(currentTicker?.bidPrice)}` : `${$t('trade.ask')} ${currentTicker?.askPrice || '--'}` }}
            · {{ isPolymarket ? `${$t('trade.askPrice')} ${formatProb(currentTicker?.askPrice)}` : `${$t('trade.bid')} ${currentTicker?.bidPrice || '--'}` }}
          </div>

          <!-- 24H 价格区间进度条 -->
          <div class="range-strip">
            <div class="range-header">
              <span>24H 区间</span>
              <span>{{ currentTicker?.low24h || '--' }} - {{ currentTicker?.high24h || '--' }}</span>
            </div>
            <div class="range-track">
              <div class="range-progress" :style="{ width: `${priceRangeProgress}%` }"></div>
            </div>
          </div>

          <!-- 四格统计数据 -->
          <div class="hero-stat-grid">
            <div class="hero-stat">
              <span>{{ isPolymarket ? $t('trade.bidPrice') : $t('trade.bid') }}</span>
              <strong>{{ isPolymarket ? formatProb(currentTicker?.bidPrice) : (currentTicker?.bidPrice || '--') }}</strong>
            </div>
            <div class="hero-stat">
              <span>{{ isPolymarket ? $t('trade.askPrice') : $t('trade.ask') }}</span>
              <strong>{{ isPolymarket ? formatProb(currentTicker?.askPrice) : (currentTicker?.askPrice || '--') }}</strong>
            </div>
            <div class="hero-stat">
              <span>{{ $t('trade.volume24h') }}</span>
              <strong>{{ currentTicker?.volume24h || '--' }}</strong>
            </div>
            <div class="hero-stat">
              <span>{{ $t('trade.activePositions') }}</span>
              <strong>{{ positionStore.positions.length }}</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- 下单表单 -->
      <OrderForm :symbol="currentSymbol" :kline-price="klineClickPrice" @submitted="handleOrderSubmitted" />
    </section>

    <!-- K 线图 -->
    <KlineChart
      :klines="marketStore.klines"
      :loading="marketStore.chartLoading"
      :symbol="currentSymbol"
      :exchange="marketStore.exchange"
      v-model="klineInterval"
      @click-price="handleKlineClickPrice"
    />

    <!-- 下方面板网格：深度图 + 成交记录 + 市场热度 -->
    <section class="trade-panel-grid">
      <!-- 盘口深度 -->
      <DepthPanel :asks="marketStore.depthAsks" :bids="marketStore.depthBids" :loading="marketStore.depthLoading" />

      <!-- 最近成交 -->
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

      <!-- 市场热度与相关品种 -->
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

        <!-- 交易风险提示 -->
        <div class="risk-box">
          <div class="risk-title">交易风险提示</div>
          <div class="risk-copy">
            实盘前确认杠杆、止盈止损与 API 权限；高波动时优先使用限价单并关注强平价变化。
          </div>
        </div>
      </section>
    </section>

    <!-- 摘要行：当前品种仓位概览 -->
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

    <!-- 持仓 + 委托汇总 -->
    <PositionsSummary :positions="positionStore.positions" :open-orders="orderStore.openOrders" />
  </div>
</template>

<script setup lang="ts">
// Vue 响应式工具、生命周期与侦听器
import { computed, ref, watch, onBeforeUnmount } from 'vue';
// Vue Router 导航组件
import { RouterLink } from 'vue-router';
// 盘口深度组件
import DepthPanel from '../components/trade/DepthPanel.vue';
// K 线图组件
import KlineChart from '../components/trade/KlineChart.vue';
// 下单表单组件
import OrderForm from '../components/trade/OrderForm.vue';
// 持仓与委托汇总组件
import PositionsSummary from '../components/trade/PositionsSummary.vue';
// 行情状态管理
import { useMarketStore } from '../stores/market';
// 交易模式管理
import { useModeStore } from '../stores/mode';
// 订单状态管理
import { useOrderStore } from '../stores/orders';
// 持仓状态管理
import { usePositionStore } from '../stores/positions';
// 数值格式化与涨跌颜色工具函数
import { formatPercent, getTrendClass } from '../utils/format';
// 国际化
import { $t } from '../utils/i18n';

// 接收路由参数：品种符号
const props = defineProps<{ symbol?: string }>();

// 各 Store 实例
const marketStore = useMarketStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

// K 线时间间隔
const klineInterval = ref('5m');
// K 线点击价格（传递给下单表单）
const klineClickPrice = ref<number | null>(null);
// 当前交易品种（根据交易所自适应）
const currentSymbol = computed(() => {
  const raw = props.symbol || 'BTC-USDT-SWAP';
  if (marketStore.exchange === 'uniswap') {
    return raw.replace('-SWAP', '');
  }
  return raw;
});
// 当前品种行情数据
const currentTicker = computed(() => marketStore.tickerMap[currentSymbol.value] || null);
// 当前品种持仓（取第一个）
const currentPosition = computed(() => positionStore.positions[0] || null);
// 基础币符号
const currentBaseSymbol = computed(() => {
  const s = currentSymbol.value;
  if (s.includes('-')) return s.split('-')[0];
  return s.replace('USDT', '');
});
// 计价币符号
const currentQuoteSymbol = computed(() => {
  if (marketStore.exchange === 'polymarket') return 'USDC';
  return 'USDT';
});
// 交易所显示标签
const exchangeLabel = computed(() => {
  if (marketStore.exchange === 'okx') return 'OKX';
  if (marketStore.exchange === 'binance') return 'Binance';
  if (marketStore.exchange === 'uniswap') return 'Uniswap V3';
  return 'Polymarket';
});
// 是否为 Polymarket 预测市场
const isPolymarket = computed(() => marketStore.exchange === 'polymarket');
// 品种快捷切换列表
const symbolShortcuts = computed(() => marketStore.symbols.slice(0, 5));
// 相关品种行情
const relatedTickers = computed(() => {
  const source = marketStore.tickers.filter((item) => item.symbol !== currentSymbol.value);
  return source.length ? source.slice(0, 4) : marketStore.tickers.slice(0, 4);
});
// 24H 价格区间进度百分比
const priceRangeProgress = computed(() => {
  const high = Number(currentTicker.value?.high24h || 0);
  const low = Number(currentTicker.value?.low24h || 0);
  const last = Number(currentTicker.value?.lastPrice || 0);

  if (!high || high <= low || !last) {
    return 50;
  }

  return Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
});

// 格式化成交时间
function formatTradeTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 格式化概率价格（百分比显示）
function formatProb(price: string | undefined | null): string {
  if (!price) return '--';
  const pct = Number(price) * 100;
  return `${pct.toFixed(1)}%`;
}

// 加载交易页面数据
async function loadTradePageData() {
  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchTickers(),
    marketStore.fetchKlines(currentSymbol.value, klineInterval.value),
    marketStore.fetchDepth(currentSymbol.value),
    marketStore.fetchRecentTrades(currentSymbol.value),
    positionStore.fetchPositions(modeStore.mode, currentSymbol.value),
    orderStore.fetchOpenOrders(modeStore.mode, currentSymbol.value),
  ]);
  initWs();
}

// 初始化 WebSocket 连接
function initWs() {
  marketStore.connectWs(currentSymbol.value, klineInterval.value);
}

// 接收 K 线点击价格
function handleKlineClickPrice(price: number) {
  klineClickPrice.value = price;
}

// 切换交易所
async function switchExchange(exch: 'okx' | 'binance' | 'uniswap' | 'polymarket') {
  marketStore.setExchange(exch);
  await loadTradePageData();
}

// 下单成功后的回调
async function handleOrderSubmitted() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode, currentSymbol.value),
    orderStore.fetchOpenOrders(modeStore.mode, currentSymbol.value),
  ]);
}

// 监听品种或模式变化，重新加载数据
watch(
  () => [props.symbol, modeStore.mode],
  () => {
    void loadTradePageData();
  },
  { immediate: true },
);

// 监听 K 线间隔变化，重新拉取并重连 WebSocket
watch(klineInterval, () => {
  marketStore.disconnectWs();
  marketStore.fetchKlines(currentSymbol.value, klineInterval.value);
  initWs();
});

// 页面卸载时断开 WebSocket
onBeforeUnmount(() => {
  marketStore.disconnectWs();
});
</script>

<style scoped>
/* 交易页面内容间距 */
.trade-page {
  gap: 18px;
}

/* 顶部行情 + 下单双栏网格 */
.trade-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.95fr);
  gap: 16px;
  align-items: start;
}

/* 行情卡片内边距 */
.hero-market-card {
  padding: 22px;
}

/* 网格布局公用 */
.hero-head,
.hero-symbol-line,
.hero-stat-grid,
.trade-panel-grid,
.trade-summary-row,
.panel-head {
  display: grid;
  gap: 14px;
}

/* 标题行 + 切换按钮 */
.hero-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

/* 工作台眉题 */
.hero-eyebrow {
  color: var(--text-secondary);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* 品种符号行 */
.hero-symbol-line {
  grid-auto-flow: column;
  justify-content: start;
  align-items: end;
  gap: 10px;
  margin-top: 6px;
}

/* 品种大标题 */
.hero-symbol {
  margin: 0;
  font-size: 38px;
  line-height: 1;
}

/* 计价币 */
.hero-quote {
  color: var(--text-secondary);
  font-size: 22px;
  font-weight: 700;
}

/* 涨跌幅标签 */
.hero-change {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 15px;
  font-weight: 800;
}

/* 模式文字 */
.hero-mode-text {
  margin-top: 10px;
  color: var(--text-secondary);
}

/* Polymarket 问题描述 */
.hero-question {
  margin-top: 10px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  max-width: 480px;
}

/* 交易所 / 品种切换按钮组 */
.symbol-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: end;
  align-items: center;
}

/* 交易所切换按钮 */
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

/* 激活态交易所按钮 */
.exchange-chip.active {
  background: rgba(99, 255, 152, 0.14);
  border-color: var(--color-up);
  color: var(--color-up);
}

.exchange-chip:hover {
  opacity: 0.85;
}

/* 品种快捷切换按钮 */
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

/* 大号价格展示 */
.price-large {
  font-size: clamp(34px, 5vw, 56px);
  font-weight: 900;
  line-height: 1;
}

/* 价格辅助信息行 */
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

/* 24H 区间进度条容器 */
.range-strip {
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

/* 区间标签行 */
.range-header {
  color: var(--text-secondary);
  font-size: 13px;
}

/* 进度条轨道 */
.range-track {
  margin-top: 12px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

/* 进度条填充 */
.range-progress {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63ff98 0%, #bbff27 100%);
}

/* 四格统计网格 */
.hero-stat-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}

/* 统计项卡片 */
.hero-stat,
.summary-card {
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

/* 统计项标签 */
.hero-stat span {
  color: var(--text-secondary);
  font-size: 13px;
}

/* 统计项数值 */
.hero-stat strong {
  display: block;
  margin-top: 8px;
  font-size: 18px;
}

/* 下方面板三栏网格 */
.trade-panel-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* 面板标题行 */
.panel-head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  margin-bottom: 10px;
}

/* 自选品种行 */
.watch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

/* 自选品种名 */
.watch-symbol {
  font-weight: 700;
}

/* 自选成交量 */
.watch-volume {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

/* 价格涨跌区块 */
.watch-price-block {
  display: grid;
  justify-items: end;
  gap: 5px;
}

/* 风险提示框 */
.risk-box {
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(245, 166, 35, 0.12);
}

/* 风险标题 */
.risk-title {
  color: var(--color-warning);
  font-weight: 700;
}

/* 风险内容 */
.risk-copy {
  margin-top: 8px;
  color: var(--text-primary);
  line-height: 1.6;
}

/* 摘要行四栏网格 */
.trade-summary-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 中屏自适应 */
@media (max-width: 1200px) {
  .trade-hero-grid,
  .trade-panel-grid,
  .trade-summary-row {
    grid-template-columns: 1fr;
  }
}

/* 窄屏自适应 */
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
