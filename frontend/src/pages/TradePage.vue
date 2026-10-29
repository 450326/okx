<template>
  <!-- 交易页面容器 -->
  <div class="page trade-page">
    <!-- 交易所切换：K 线/盘口/成交统一跟随 -->
    <section class="card exchange-switcher">
      <div class="exchange-tabs">
        <button
          v-for="item in exchanges"
          :key="item.value"
          :class="['exchange-tab', { active: marketStore.exchange === item.value }]"
          :disabled="isStockToken && item.value !== 'okx'"
          :title="isStockToken && item.value !== 'okx' ? '股票代币目前只支持 OKX' : ''"
          @click="switchExchange(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="exchange-meta">
        <span v-if="isStockToken" class="asset-badge">股票代币</span>
        <span class="status-text">当前行情：{{ exchangeLabel }}</span>
        <span class="exchange-symbol">{{ currentSymbol }}</span>
      </div>
    </section>

    <!-- K 线 + 下单区: 并排 -->
    <section class="kline-order-grid">
      <KlineChart
        :klines="marketStore.klines"
        :loading="marketStore.chartLoading"
        :symbol="currentSymbol"
        :exchange="marketStore.exchange"
        :trade-markers="klineTradeMarkers"
        :position="currentPosition"
        v-model="klineInterval"
        @click-price="handleKlineClickPrice"
      />
      <OrderForm :symbol="currentSymbol" :kline-price="klineClickPrice" @submitted="handleOrderSubmitted" />
    </section>

    <!-- 持仓 + 委托汇总：只显示当前交易对，紧跟交易区下方并按 5 秒轮询刷新 -->
    <PositionsSummary
      :positions="currentPositions"
      :open-orders="currentOpenOrders"
      :mode="modeStore.mode"
      @closed="handlePositionClosed"
      @cancelled="handlePositionClosed"
      @select="handlePositionSelect"
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
            <tr v-for="(item, idx) in visibleTrades" :key="`${item.ts}-${idx}`">
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
          <div class="watch-left">
            <CoinIcon :symbol="item.symbol" :size="26" :asset-class="item.assetClass" />
            <div>
              <div class="watch-symbol">{{ item.symbol }}</div>
              <div class="watch-volume">24H 量 {{ item.volume24h }}</div>
            </div>
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
            下单前确认杠杆、止盈止损与 API 权限；高波动时优先使用限价单并关注强平价变化。
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
  </div>
</template>

<script setup lang="ts">
// Vue 响应式工具、生命周期与侦听器
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
// Vue Router 导航组件
import { RouterLink, useRoute, useRouter } from 'vue-router';
// 币种图标组件
import CoinIcon from '../components/common/CoinIcon.vue';
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
// 资产状态管理
import { useAssetStore } from '../stores/assets';
// 交易模式管理
import { useModeStore } from '../stores/mode';
// 订单状态管理
import { useOrderStore } from '../stores/orders';
// 持仓状态管理
import { usePositionStore } from '../stores/positions';
// 数值格式化与涨跌颜色工具函数
import { formatPercent, getTrendClass } from '../utils/format';
// 交易对格式转换
import { exchangeFromSymbol, isSymbolForExchange, toExchangeSymbol, type ExchangeId } from '../utils/symbol';
// 国际化
import { $t } from '../utils/i18n';
// 类型
import type { KlineTradeMarker, OrderItem } from '../api/types';

// 接收路由参数：品种符号
const props = defineProps<{ symbol?: string }>();

// 各 Store 实例
const route = useRoute();
const router = useRouter();
const marketStore = useMarketStore();

// 股票代币只有 OKX 有；带着 asset=stock 进入时强制切回 OKX。
// 普通品种则根据路由里的原生 symbol 恢复对应交易所，避免刷新后 Coinbase/Binance 被重置回 OKX。
const routeExchange = exchangeFromSymbol(props.symbol || '');
if (route.query.asset === 'stock') {
  if (marketStore.exchange !== 'okx') marketStore.setExchange('okx');
} else if (routeExchange && marketStore.exchange !== routeExchange) {
  marketStore.setExchange(routeExchange);
}
const assetStore = useAssetStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

// 交易页支持的行情交易所
const exchanges = [
  { value: 'okx' as const, label: 'OKX' },
  { value: 'binance' as const, label: 'Binance' },
  { value: 'coinbase' as const, label: 'Coinbase' },
];

// K 线时间间隔
const klineInterval = ref('5m');
// K 线点击价格（传递给下单表单）
const klineClickPrice = ref<number | null>(null);
// 当前交易品种：路由里可能是 OKX 格式，按当前交易所转换成 BTCUSDT / BTC-USD
const currentSymbol = computed(() =>
  toExchangeSymbol(props.symbol || 'BTC-USDT-SWAP', marketStore.exchange),
);

// 当前是否股票代币：路由标记或 OKX 元数据
const isStockToken = computed(
  () =>
    route.query.asset === 'stock' ||
    marketStore.stockSymbols.some((item) => item.symbol === currentSymbol.value) ||
    marketStore.symbols.some(
      (item) => item.symbol === currentSymbol.value && item.assetClass === 'stock',
    ),
);
// 当前品种行情数据
const currentTicker = computed(() => marketStore.tickerMap[currentSymbol.value] || null);
// 利用 WebSocket 实时行情重算持仓盈亏和标记价
const livePositions = computed(() =>
  positionStore.positions.map((p) => {
    const ticker = marketStore.tickerMap[p.symbol];
    if (!ticker) return p;
    const entry = Number(p.entryPrice);
    const mark = Number(ticker.markPrice || ticker.lastPrice);
    const qty = Number(p.qty);
    const margin = Number(p.initialMargin || 0);
    const pnl =
      p.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
    return {
      ...p,
      unrealizedPnl: pnl.toFixed(2),
      markPrice: ticker.markPrice || ticker.lastPrice,
      lastPrice: ticker.lastPrice,
      // 后端返回小数（0.15），这里换算成 ratio 供模板 ×100 展示。
      roe: margin > 0 ? (pnl / margin).toFixed(6) : '0.000000',
    };
  }),
);

// 当前品种持仓（只取当前 symbol，避免把其他品种的仓位显示过来）
const currentPosition = computed(
  () => livePositions.value.find((p) => p.symbol === currentSymbol.value) || null,
);

// 交易区下方只展示当前交易对的持仓和委托
const currentPositions = computed(() => (currentPosition.value ? [currentPosition.value] : []));
const currentOpenOrders = computed(() =>
  orderStore.openOrders.filter((order) => order.symbol === currentSymbol.value),
);

// 把订单方向转换成 K 线上的买/卖标记：开多/平空为 B，开空/平多为 S
function orderTradeSide(order: OrderItem): 'buy' | 'sell' | null {
  if (!order.side) return null;
  if (order.action === 'close') {
    return order.side === 'long' ? 'sell' : 'buy';
  }
  return order.side === 'long' ? 'buy' : 'sell';
}

function orderFillTimestamp(order: OrderItem): number {
  const raw = order.filledAt || order.updatedAt || order.createdAt;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

// 当前品种已成交订单 -> K 线 B/S 标记
const klineTradeMarkers = computed<KlineTradeMarker[]>(() =>
  orderStore.historyOrders
    .filter((order) => order.symbol === currentSymbol.value && order.status === 'filled')
    .map((order) => {
      const side = orderTradeSide(order);
      const time = orderFillTimestamp(order);
      const price = Number(order.avgFillPrice ?? order.price ?? 0);
      if (!side || !time || !Number.isFinite(price) || price <= 0) return null;
      return { time, side, price };
    })
    .filter((item): item is KlineTradeMarker => item !== null)
    .sort((a, b) => a.time - b.time),
);

// 相关品种行情：股票代币只显示股票代币，加密货币只显示加密货币
const relatedTickers = computed(() => {
  const pool = isStockToken.value ? marketStore.stockTickers : marketStore.tickers;
  const source = pool.filter(
    (item) =>
      item.symbol !== currentSymbol.value &&
      (item.assetClass === 'stock') === isStockToken.value &&
      isSymbolForExchange(item.symbol, marketStore.exchange),
  );
  return [...source]
    .sort((a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0))
    .slice(0, 4);
});
// 最近成交（取最新 15 条）
const visibleTrades = computed(() => marketStore.recentTrades.slice(0, 15));
// 格式化成交时间
function formatTradeTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 刷新账户持仓/委托/成交，供手动操作和定时轮询复用
async function refreshAccountData() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchOpenOrders(modeStore.mode),
    orderStore.fetchHistory(modeStore.mode),
    assetStore.fetchAssets(modeStore.mode),
  ]);
}

// 加载交易页面数据
async function loadTradePageData() {
  await Promise.all([
    marketStore.fetchSymbols(),
    marketStore.fetchTickers(),
    marketStore.fetchStockMarkets(),
    marketStore.fetchKlines(currentSymbol.value, klineInterval.value),
    marketStore.fetchDepth(currentSymbol.value),
    marketStore.fetchRecentTrades(currentSymbol.value),
    refreshAccountData(),
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

// 切换交易所：把当前币种转换成目标交易所的原生 symbol，并更新路由
async function switchExchange(exch: ExchangeId) {
  if (marketStore.exchange === exch) return;
  if (isStockToken.value && exch !== 'okx') return;
  const target = toExchangeSymbol(props.symbol || currentSymbol.value, exch);
  marketStore.setExchange(exch);
  await router.replace(`/trade/${target}`);
}

// 从持仓/委托的 symbol 反推交易所，点击下方持仓行时切到对应交易所
async function handlePositionSelect(symbol: string) {
  const targetExchange = exchangeFromSymbol(symbol);
  if (targetExchange && marketStore.exchange !== targetExchange) {
    marketStore.setExchange(targetExchange);
  }
  await router.push(`/trade/${symbol}`);
}

// 平仓后刷新
async function handlePositionClosed() {
  await refreshAccountData();
}

// 下单成功后的回调
async function handleOrderSubmitted() {
  await refreshAccountData();
}

// 监听品种或模式变化，重新加载数据（currentSymbol 同时覆盖路由 symbol 和交易所变化）
watch(
  () => [currentSymbol.value, modeStore.mode],
  () => {
    void loadTradePageData();
  },
  { immediate: true },
);

// 路由里的 symbol 决定交易所，保证刷新/快速切换后图表、持仓和标记一致
watch(
  () => props.symbol,
  (symbol) => {
    const inferred = exchangeFromSymbol(symbol || '');
    if (inferred && marketStore.exchange !== inferred) {
      marketStore.setExchange(inferred);
    }
  },
);

// 监听 K 线间隔变化，重新拉取并重连 WebSocket
watch(klineInterval, () => {
  marketStore.disconnectWs();
  marketStore.fetchKlines(currentSymbol.value, klineInterval.value);
  initWs();
});

// 交易所显示名称映射
const exchangeLabel = computed(() => {
  const labels: Record<string, string> = {
    okx: 'OKX',
    binance: 'Binance',
    coinbase: 'Coinbase',
    uniswap: 'Uniswap',
  };
  return labels[marketStore.exchange] || marketStore.exchange;
});

// 每 5 秒同步一次持仓/委托/成交：限价单成交、后台强平后页面能自动跟上
let accountRefreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  accountRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    void refreshAccountData();
  }, 5000);
});

// 页面卸载时断开 WebSocket 并停止轮询
onBeforeUnmount(() => {
  if (accountRefreshTimer) {
    clearInterval(accountRefreshTimer);
    accountRefreshTimer = null;
  }
  marketStore.disconnectWs();
});
</script>

<style scoped>
/* 交易页面内容间距 */
.trade-page {
  gap: 14px;
}

/* K 线 + 下单面板并排网格 */
.kline-order-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

/* 网格布局公用 */
.trade-panel-grid,
.trade-summary-row,
.panel-head {
  display: grid;
  gap: 14px;
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

/* 交易所切换条 */
.exchange-switcher {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
}

.exchange-tabs {
  display: flex;
  gap: 6px;
}

.exchange-tab {
  padding: 7px 14px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.exchange-tab.active {
  border-color: rgba(187, 255, 39, 0.36);
  background: rgba(187, 255, 39, 0.12);
  color: #bbff27;
}

.exchange-tab:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.asset-badge {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.16);
  color: #60a5fa;
  font-size: 10px;
  font-weight: 700;
}

.exchange-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.exchange-symbol {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

/* 自选品种左侧图标 + 文案 */
.watch-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 摘要行四栏网格 */
.trade-summary-row {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 中屏自适应 */
@media (max-width: 1200px) {
  .kline-order-grid {
    grid-template-columns: 1fr;
  }
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

  .hero-compact-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
