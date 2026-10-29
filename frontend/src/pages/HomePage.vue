<template>
  <!-- 首页容器 -->
  <div class="page home-page">
    <section class="home-content">
      <!-- 顶栏：标题 + 搜索 -->
      <div class="home-toolbar">
        <div class="toolbar-copy">
          <h1 class="home-title">交易看板</h1>
          <p class="home-subtitle">{{ $t('home.subtitle') }}</p>
        </div>

        <div class="search-wrap">
          <div class="search-bar">
            <span class="search-icon">⌕</span>
            <input
              v-model="searchQuery"
              class="search-input"
              placeholder="搜索币种，例如 BTC / ETH"
              @focus="searchFocused = true"
              @blur="handleSearchBlur"
              @keydown.enter.prevent="handleSearchEnter"
              @keydown.esc="clearSearch"
            />
            <button v-if="searchQuery" class="search-clear" @click="clearSearch">✕</button>
          </div>

          <div v-if="showSearchResults" class="search-results">
            <button
              v-for="item in searchResults"
              :key="item.symbol"
              type="button"
              class="search-result"
              @mousedown.prevent="goSearchResult(item)"
            >
              <CoinIcon :symbol="item.symbol" :size="24" :asset-class="item.assetClass" />
              <div class="search-result-main">
                <strong>{{ splitSymbol(item.symbol).base }}</strong>
                <span>/ {{ splitSymbol(item.symbol).quote }}</span>
                <em v-if="item.assetClass === 'stock'" class="asset-badge">股票</em>
              </div>
              <div class="search-result-price">{{ item.lastPrice }}</div>
              <div :class="['search-result-change', getTrendClass(item.priceChangePercent24h)]">
                {{ formatPercent(item.priceChangePercent24h) }}
              </div>
            </button>
            <div v-if="!searchResults.length" class="search-empty">没有匹配的合约</div>
          </div>
        </div>
      </div>

      <!-- 总资产卡片 -->
      <section class="card hero-card">
        <div class="hero-copy">
          <div class="hero-label">
            {{ $t('home.totalAssets') }}
            <span class="eye-dot"></span>
          </div>
          <div class="hero-balance">
            {{ formatCurrency(assetStore.snapshot?.equity) }}
          </div>
          <div class="hero-yield">
            {{ $t('layout.unrealizedPnl') }}
            <span :class="getTrendClass(assetStore.snapshot?.unrealizedPnl)">
              {{ formatSignedCurrency(assetStore.snapshot?.unrealizedPnl) }}
              ({{ yieldPercent }})
            </span>
          </div>
        </div>

        <div class="hero-actions">
          <RouterLink class="action-btn action-primary" :to="`/trade/${currentTicker?.symbol || 'BTC-USDT-SWAP'}`">
            {{ $t('nav.trade') }}
          </RouterLink>
          <RouterLink class="action-btn action-secondary" to="/positions">
            {{ $t('nav.positions') }}
          </RouterLink>
        </div>
      </section>

      <!-- 资金曲线图 -->
      <section class="card equity-curve-card">
        <EquityChart :mode="modeStore.mode" range="30d" />
      </section>

      <!-- 紧凑行情卡 -->
      <section class="card hero-market-card">
        <div class="hero-head">
          <div class="hero-symbol-line">
            <CoinIcon
              :symbol="currentTicker?.symbol || 'BTC-USDT-SWAP'"
              :asset-class="currentTicker?.assetClass"
              :size="26"
            />
            <h1 class="hero-symbol">{{ currentBaseSymbol }}</h1>
            <span class="hero-quote">/ {{ currentQuoteSymbol }}</span>
            <span :class="['hero-change', getTrendClass(currentTicker?.priceChangePercent24h)]">
              {{ formatPercent(currentTicker?.priceChangePercent24h) }}
            </span>
          </div>
          <div class="hero-side">
            <RouterLink class="ghost-btn" :to="`/trade/${currentTicker?.symbol || 'BTC-USDT-SWAP'}`">
              {{ $t('nav.trade') }}
            </RouterLink>
          </div>
        </div>
        <div class="hero-compact-row">
          <div class="price-large">{{ currentTicker?.lastPrice || '--' }}</div>
          <div class="hero-stat-group">
            <span>{{ $t('trade.ask') }} {{ currentTicker?.askPrice || '--' }}</span>
            <span class="hero-divider"></span>
            <span>{{ $t('trade.bid') }} {{ currentTicker?.bidPrice || '--' }}</span>
            <span class="hero-divider"></span>
            <span>{{ $t('trade.volume24h') }} {{ currentTicker?.volume24h || '--' }}</span>
          </div>
          <div class="range-strip compact-range">
            <div class="range-track">
              <div class="range-progress" :style="{ width: `${priceRangeProgress}%` }"></div>
            </div>
            <div class="range-label">{{ currentTicker?.low24h || '--' }} — {{ currentTicker?.high24h || '--' }}</div>
          </div>
        </div>
      </section>

      <!-- 热门市场列表 -->
      <section class="card market-panel">
        <div class="section-head">
          <h2 class="section-title">{{ $t('home.hotRank') }}</h2>
          <RouterLink class="ghost-btn" to="/markets">{{ $t('common.all') }}</RouterLink>
        </div>
        <div class="market-list">
        <RouterLink v-for="item in featuredMarkets" :key="item.symbol" :to="`/trade/${item.symbol}`" class="market-row">
          <div class="market-meta">
            <CoinIcon :symbol="item.symbol" :size="34" :asset-class="item.assetClass" />
            <div>
              <div class="market-symbol">{{ splitSymbol(item.symbol).base }} <span>/ {{ splitSymbol(item.symbol).quote }}</span></div>
              <div class="market-sub">{{ formatVolumeCompact(item.volume24h) }}</div>
            </div>
          </div>

          <div class="market-price">
            <div>{{ item.lastPrice }}</div>
            <div class="market-turnover">{{ formatTurnover(item.volume24h, item.lastPrice) }}</div>
          </div>

          <div :class="['market-change', getTrendClass(item.priceChangePercent24h)]">
            {{ formatPercent(item.priceChangePercent24h) }}
          </div>
        </RouterLink>
        </div>
      </section>

      <!-- 持仓列表 -->
      <section class="card positions-panel">
        <div class="section-head">
          <h2 class="section-title">{{ $t('home.positionsSnapshot') }}</h2>
          <RouterLink v-if="recentPositions.length" class="ghost-btn" to="/positions">{{ $t('common.all') }}</RouterLink>
        </div>
        <table v-if="recentPositions.length" class="table">
           <thead>
             <tr>
               <th>品种</th>
               <th>方向</th>
               <th>{{ $t('trade.leverage') }}</th>
               <th>数量</th>
               <th>开仓价</th>
               <th>开仓时间</th>
               <th>盈亏</th>
               <th></th>
             </tr>
           </thead>
           <tbody>
             <tr v-for="item in recentPositions" :key="item.id" class="pos-row" @click="goTrade(item.symbol)">
               <td>
                  {{ item.symbol }}
                  <em v-if="stockSymbolSet.has(item.symbol)" class="asset-badge">股票</em>
                </td>
               <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? '多' : '空' }}</td>
               <td>{{ item.leverage }}x</td>
               <td>{{ item.qty }}</td>
               <td>{{ item.entryPrice }}</td>
               <td class="time-cell">{{ formatOpenTime(item.createdAt) }}</td>
               <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
               <td><button class="close-btn" :disabled="closingId === item.id" @click.stop="handleClose(item)">{{ closingId === item.id ? '...' : '平仓' }}</button></td>
             </tr>
           </tbody>
         </table>
        <div v-else class="empty-state">{{ $t('home.noPositionData') }}</div>
      </section>

      <!-- 底部导航栏 -->
      <footer class="bottom-dock">
        <RouterLink to="/" class="dock-item active">
          <span class="dock-icon">▦</span>
          <span>欧易</span>
        </RouterLink>
        <RouterLink to="/markets" class="dock-item">
          <span class="dock-icon">◇</span>
          <span>探索</span>
        </RouterLink>
        <RouterLink to="/trade/BTC-USDT-SWAP" class="dock-item dock-main">
          <span class="dock-main-icon">⇄</span>
          <span>交易</span>
        </RouterLink>
        <RouterLink to="/positions" class="dock-item">
          <span class="dock-icon">◔</span>
          <span>仓位</span>
        </RouterLink>
        <RouterLink to="/assets" class="dock-item">
          <span class="dock-icon">◴</span>
          <span>资产</span>
        </RouterLink>
      </footer>
    </section>

    <!-- 辅助信息区域（桌面端） -->
    <section class="support-grid">
      <!-- 最近订单 -->
      <div class="card recent-orders">
        <div class="section-head">
          <h2 class="section-title">{{ $t('home.recentOrders') }}</h2>
          <RouterLink class="ghost-btn" to="/orders/history">{{ $t('common.all') }}</RouterLink>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>品种</th>
              <th>类型</th>
              <th>方向</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in recentOrders" :key="item.orderId">
              <td>{{ formatOrderId(item.orderId) }}</td>
              <td>
                  {{ item.symbol }}
                  <em v-if="stockSymbolSet.has(item.symbol)" class="asset-badge">股票</em>
                </td>
              <td>{{ item.orderType }}</td>
              <td>{{ item.side === 'long' ? '多' : '空' }}</td>
              <td>{{ formatOrderStatus(item.status) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 账户摘要 -->
      <div class="card account-summary">
        <h2 class="section-title">{{ $t('home.accountSummary') }}</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span>{{ $t('home.availableBalance') }}</span>
            <strong>{{ formatCurrency(assetStore.snapshot?.availableBalance) }}</strong>
          </div>
          <div class="summary-item">
            <span>{{ $t('home.lastOrder') }}</span>
            <strong>{{ recentOrders[0]?.symbol || $t('common.noData') }}</strong>
          </div>
          <div class="summary-item">
            <span>{{ $t('home.activePositionsCount') }}</span>
            <strong>{{ recentPositions.length }} {{ $t('trade.activePositions') }}</strong>
          </div>
        </div>
      </div>
    </section>

    <!-- 股票代币：与加密货币完全分开 -->
    <section class="card stock-panel">
      <div class="section-head">
        <div class="stock-heading">
          <h2 class="section-title">股票代币</h2>
          <span class="asset-badge">OKX · {{ marketStore.stockTickers.length }} 个</span>
        </div>
        <RouterLink class="ghost-btn" :to="{ path: '/markets', query: { category: 'stock' } }">
          全部股票代币
        </RouterLink>
      </div>

      <div class="stock-grid">
        <RouterLink
          v-for="item in topStockTickers"
          :key="item.symbol"
          :to="{ path: `/trade/${item.symbol}`, query: { asset: 'stock' } }"
          class="stock-row"
          @click="ensureOkx"
        >
          <CoinIcon :symbol="item.symbol" :asset-class="'stock'" :size="28" />
          <div class="stock-meta">
            <div class="stock-symbol">{{ splitSymbol(item.symbol).base }}</div>
            <div class="stock-sub">{{ item.symbol }}</div>
          </div>
          <div class="stock-price">{{ item.lastPrice }}</div>
          <div :class="['stock-change', getTrendClass(item.priceChangePercent24h)]">
            {{ formatPercent(item.priceChangePercent24h) }}
          </div>
        </RouterLink>
      </div>
      <div v-if="!topStockTickers.length" class="empty-state">股票代币行情加载中...</div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Vue 响应式工具与侦听器
import { computed, ref, watch } from 'vue';
// Vue Router 导航组件
import { RouterLink, useRouter } from 'vue-router';
// 资产状态管理
import { useAssetStore } from '../stores/assets';
// 行情状态管理
import { useMarketStore } from '../stores/market';
// 交易模式管理
import { useModeStore } from '../stores/mode';
// 订单状态管理
import { useOrderStore } from '../stores/orders';
// 持仓状态管理
import { usePositionStore } from '../stores/positions';
// 资金曲线图组件
import EquityChart from '../components/trade/EquityChart.vue';
// 币种图标组件
import CoinIcon from '../components/common/CoinIcon.vue';
// 国际化
import { $t } from '../utils/i18n';
// 交易对格式转换
import { toExchangeSymbol } from '../utils/symbol';
// API
import { positionApi } from '../api/services';
import type { TickerItem } from '../api/types';
// 数值格式化与涨跌颜色工具函数
import { formatPercent, formatSignedValue, formatSignedCurrency, formatCurrency, formatCompactVolume, getTrendClass, formatOrderId, formatOrderStatus } from '../utils/format';

// 各 Store 实例
const assetStore = useAssetStore();
const marketStore = useMarketStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();
const stockSymbolSet = computed(() => new Set(marketStore.stockTickers.map((item) => item.symbol)));

// 搜索
const searchQuery = ref('');
const searchFocused = ref(false);

// 热门加密货币（排除股票代币，股票代币单独一个板块）
const featuredMarkets = computed(() =>
  [...marketStore.tickers]
    .filter((ticker) => ticker.assetClass !== 'stock')
    .sort((a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0))
    .slice(0, 8),
);

// 股票代币：OKX 独立行情；首页优先展示常见标的，其余按成交量排序
const STOCK_PRIORITY: Record<string, number> = {
  AAPL: 0,
  TSLA: 1,
  NVDA: 2,
  MSFT: 3,
  AMZN: 4,
  GOOGL: 5,
  META: 6,
  SPY: 7,
  QQQ: 8,
  AMD: 9,
  NFLX: 10,
  PLTR: 11,
  COIN: 12,
  MSTR: 13,
  AVGO: 14,
  TSM: 15,
};
const topStockTickers = computed(() =>
  [...marketStore.stockTickers]
    .sort((a, b) => {
      const pa = STOCK_PRIORITY[splitSymbol(a.symbol).base] ?? 999;
      const pb = STOCK_PRIORITY[splitSymbol(b.symbol).base] ?? 999;
      if (pa !== pb) return pa - pb;
      return Number(b.volume24h || 0) - Number(a.volume24h || 0);
    })
    .slice(0, 12),
);

// 搜索结果：加密货币 + 股票代币一起搜，按成交量排序
const searchResults = computed(() => {
  const keyword = searchQuery.value.trim().toUpperCase();
  if (!keyword) return [];
  const pool = new Map<string, TickerItem>();
  for (const ticker of [...marketStore.tickers, ...marketStore.stockTickers]) {
    if (!pool.has(ticker.symbol)) pool.set(ticker.symbol, ticker);
  }
  return [...pool.values()]
    .filter((ticker) => ticker.symbol.toUpperCase().includes(keyword))
    .sort((a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0))
    .slice(0, 8);
});

// 输入框聚焦且有关键词时展示下拉结果
const showSearchResults = computed(
  () => searchFocused.value && searchQuery.value.trim().length > 0,
);
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

// 最近持仓（取前 4 条，盈亏实时更新）
const recentPositions = computed(() => livePositions.value.slice(0, 4));
// 历史订单（取前 5 条）
const recentOrders = computed(() => orderStore.historyOrders.slice(0, 5));
// 年化收益率
const yieldPercent = computed(() => {
  const equity = Number(assetStore.snapshot?.equity || 0);
  const unrealized = Number(assetStore.snapshot?.unrealizedPnl || 0);
  const percent = equity ? (unrealized / equity) * 100 : 0;
  return formatPercent(percent);
});

// 拆分品种符号为基础币与计价币
function splitSymbol(symbol: string) {
  const [base = symbol, quote = 'USDT'] = symbol.split('-');
  return { base, quote };
}

// 格式化成交量（紧凑显示）
function formatVolumeCompact(value?: string) {
  const amount = Number(value || 0);

  if (amount >= 1000000) {
    return `₮${(amount / 1000000).toFixed(2)} 百万`;
  }

  if (amount >= 1000) {
    return `₮${(amount / 1000).toFixed(2)} 千`;
  }

  return `₮${amount.toFixed(2)}`;
}

// 格式化成交易额（24H 成交量 × 最新价）
function formatTurnover(volume?: string, price?: string) {
  const amount = Number(volume || 0) * Number(price || 0);

  if (amount >= 1000000) {
    return `₮${(amount / 1000000).toFixed(2)}M`;
  }

  if (amount >= 1000) {
    return `₮${(amount / 1000).toFixed(2)}K`;
  }

  return `₮${amount.toFixed(0)}`;
}

const router = useRouter();
const closingId = ref('');

function formatOpenTime(iso?: string) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function goTrade(symbol: string) {
  router.push(`/trade/${symbol}`);
}

// 点击搜索结果：股票代币固定走 OKX
function goSearchResult(item: TickerItem) {
  searchQuery.value = '';
  searchFocused.value = false;
  if (item.assetClass === 'stock') {
    if (marketStore.exchange !== 'okx') marketStore.setExchange('okx');
    router.push({ path: `/trade/${item.symbol}`, query: { asset: 'stock' } });
    return;
  }
  router.push(`/trade/${item.symbol}`);
}

// 回车直接进入第一条搜索结果
function handleSearchEnter() {
  const first = searchResults.value[0];
  if (first) goSearchResult(first);
}

// 打开股票代币前先切回 OKX（股票代币只有 OKX 有）
function ensureOkx() {
  if (marketStore.exchange !== 'okx') marketStore.setExchange('okx');
}

// 清空搜索词
function clearSearch() {
  searchQuery.value = '';
}

// 失焦后延迟收起，给结果的 mousedown 留出点击时间
function handleSearchBlur() {
  window.setTimeout(() => {
    searchFocused.value = false;
  }, 120);
}

async function handleClose(item: { id: string; symbol: string }) {
  if (closingId.value) return;
  closingId.value = item.id;
  try {
    await positionApi.closePosition(item.id, { symbol: item.symbol });
    await Promise.all([
      positionStore.fetchPositions(modeStore.mode),
      assetStore.fetchAssets(modeStore.mode),
    ]);
  } catch {
    // 首页只做快捷平仓，失败时保留列表，详细信息可在交易页查看。
  }
  closingId.value = '';
}

// 行情卡计算属性：优先当前交易所的 BTC，其次取 24H 成交量最高的品种。
const currentTicker = computed(() => {
  const btc = marketStore.tickerMap[toExchangeSymbol('BTC-USDT-SWAP', marketStore.exchange)];
  if (btc) return btc;
  return [...marketStore.tickers].sort(
    (a, b) => Number(b.volume24h || 0) - Number(a.volume24h || 0),
  )[0] || null;
});
const currentBaseSymbol = computed(() => {
  const s = currentTicker.value?.symbol || 'BTC-USDT-SWAP';
  return s.includes('-') ? s.split('-')[0] : s.replace('USDT', '');
});
const currentQuoteSymbol = computed(
  () => splitSymbol(currentTicker.value?.symbol || 'BTC-USDT-SWAP').quote,
);
const priceRangeProgress = computed(() => {
  const high = Number(currentTicker.value?.high24h || 0);
  const low = Number(currentTicker.value?.low24h || 0);
  const last = Number(currentTicker.value?.lastPrice || 0);
  if (!high || high <= low || !last) return 50;
  return Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
});

// 加载首页数据
async function loadPageData() {
  await Promise.all([
    assetStore.fetchAssets(modeStore.mode),
    marketStore.fetchTickers(),
    marketStore.fetchStockMarkets(),
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchHistory(modeStore.mode),
  ]);
}

// 监听交易模式变化重新加载数据
watch(
  () => modeStore.mode,
  () => {
    void loadPageData();
  },
  { immediate: true },
);
</script>

<style scoped>
/* 首页内容间距 */
.home-page {
  gap: 20px;
}

/* 移动端外壳容器 */
.mobile-shell {
  width: min(100%, 760px);
  margin: 0 auto;
  padding: 22px;
  border-radius: 32px;
  background:
    radial-gradient(circle at right top, rgba(171, 255, 47, 0.12), transparent 28%),
    linear-gradient(180deg, #080808 0%, #0d0f12 100%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 30px 60px rgba(2, 6, 12, 0.42);
}

/* 移动端顶部栏 */
.mobile-topbar,
.mode-switch,
.market-tabs,
.spot-switch,
.quick-actions,
.summary-grid,
.bottom-dock {
  display: flex;
  gap: 12px;
}

/* 顶部栏两端对齐 */
.mobile-topbar,
.section-head {
  align-items: center;
  justify-content: space-between;
}

/* 无边框按钮公用 */
.mode-pill,
.tab-chip,
.tab-arrow,
.spot-pill {
  border: none;
  cursor: pointer;
}

/* 模式切换按钮组 */
.mode-switch {
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

/* 模式胶囊按钮 */
.mode-pill {
  padding: 10px 20px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 700;
}

/* 激活态胶囊按钮 */
.mode-pill.active,
.tab-chip.active,
.spot-pill.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
}

/* 搜索图标 */
.search-icon {
  font-size: 22px;
  flex-shrink: 0;
}

/* 搜索输入框 */
.search-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 18px;
  outline: none;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

/* 搜索清空按钮 */
.search-clear {
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}

/* 资产卡片 */
.hero-card {
  margin-top: 26px;
}

/* 总资产标签行 */
.hero-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 15px;
}

/* 资产显隐圆点 */
.eye-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* 总资产余额数字 */
.hero-balance {
  margin-top: 14px;
  font-size: clamp(42px, 7vw, 72px);
  font-weight: 800;
  line-height: 0.96;
}

/* USDT 单位 */
.hero-balance span {
  font-size: 0.38em;
  font-weight: 700;
}

/* 年收益行 */
.hero-yield {
  margin-top: 18px;
  color: var(--text-secondary);
  font-size: 18px;
}

.hero-yield span {
  margin-left: 10px;
  font-weight: 700;
}

/* 快捷操作按钮行 */
.quick-actions {
  margin-top: 26px;
}

/* 操作按钮通用 */
.action-btn {
  flex: 1;
  min-height: 58px;
  border: none;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 800;
}

/* 主操作按钮 */
.action-primary {
  background: #bbff27;
  color: #0d1205;
}

/* 次操作按钮 */
.action-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

/* 资金曲线卡片 */
.equity-curve-card {
  margin-top: 24px;
  padding: 24px;
}

/* 行情标签栏 */
.market-tabs {
  margin-top: 28px;
  flex-wrap: wrap;
}

/* 标签芯片 */
.tab-chip,
.tab-arrow,
.spot-pill {
  padding: 10px 18px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
}

/* 标签箭头 */
.tab-arrow {
  padding-inline: 12px;
}

/* 现货/合约切换 */
.spot-switch {
  margin-top: 16px;
}

/* 市场列表 */
.market-list {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

/* 市场行 */
.market-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(110px, 0.8fr) 120px;
  gap: 14px;
  align-items: center;
  padding: 10px 0;
}

/* 弹性居中公用 */
.market-meta,
.market-symbol,
.dock-item {
  display: flex;
  align-items: center;
}

.market-meta {
  gap: 14px;
}

/* 币种头像 */
.coin-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 900;
  color: #fff;
}

/* BTC 渐变色 */
.coin-btc {
  background: linear-gradient(135deg, #ffb14c, #e98b18);
}

/* ETH 渐变色 */
.coin-eth {
  background: linear-gradient(135deg, #7f9cff, #4b64f1);
}

/* SOL 渐变色 */
.coin-sol {
  background: linear-gradient(135deg, #60ffd1, #6b4cff);
}

/* 其他币种 */
.coin-alt {
  background: linear-gradient(135deg, #e4e7ee, #646b7a);
}

/* 市场符号 */
.market-symbol {
  gap: 6px;
  font-size: 20px;
  font-weight: 800;
}

.market-symbol span,
.market-sub,
.market-turnover {
  color: var(--text-secondary);
}

/* 辅助信息字号 */
.market-sub,
.market-turnover {
  margin-top: 6px;
  font-size: 15px;
}

/* 市场价格列 */
.market-price {
  text-align: right;
  font-size: 18px;
  font-weight: 700;
}

/* 涨跌幅标签 */
.market-change {
  justify-self: end;
  min-width: 116px;
  padding: 14px 12px;
  border-radius: 14px;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
}

/* 涨 */
.market-change.up {
  background: rgba(18, 195, 102, 0.92);
  color: #effff5;
}

/* 跌 */
.market-change.down {
  background: rgba(246, 70, 93, 0.9);
  color: #fff3f5;
}

/* 底部导航栏 */
.bottom-dock {
  justify-content: space-between;
  margin-top: 28px;
  padding: 14px 12px 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 底部导航项 */
.dock-item {
  flex-direction: column;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 激活态导航 */
.dock-item.active {
  color: #bbff27;
}

/* 导航图标 */
.dock-icon {
  font-size: 21px;
}

/* 主交易按钮上浮 */
.dock-main {
  transform: translateY(-16px);
}

/* 主交易按钮圆形图标 */
.dock-main-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #f3f4f7;
  color: #06090e;
  font-size: 28px;
  font-weight: 900;
}

/* 辅助信息网格（桌面） */
.support-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

/* 摘要网格 */
.summary-grid {
  flex-wrap: wrap;
}

/* 摘要项卡片 */
.summary-item {
  flex: 1 1 calc(50% - 12px);
  min-width: 180px;
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

/* 摘要标签 */
.summary-item span {
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
}

/* 摘要数值 */
.summary-item strong {
  display: block;
  margin-top: 10px;
  font-size: 18px;
}

/* 紧凑行情卡 */
.hero-market-card {
  margin-top: 24px;
  padding: 16px 22px;
}

.hero-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
}

.hero-symbol-line {
  display: grid;
  grid-auto-flow: column;
  justify-content: start;
  align-items: end;
  gap: 8px;
  margin-top: 4px;
}

.hero-symbol {
  margin: 0;
  font-size: 26px;
  line-height: 1;
}

.hero-quote {
  color: var(--text-secondary);
  font-size: 16px;
  font-weight: 700;
}

.hero-change {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13px;
  font-weight: 800;
}

.hero-compact-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.hero-stat-group {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  flex-wrap: wrap;
}

.hero-divider {
  width: 1px;
  height: 16px;
  background: var(--border-color);
}

.price-large {
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 900;
  line-height: 1;
}

.compact-range {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
}

.range-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
  min-width: 100px;
}

.range-progress {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63ff98 0%, #bbff27 100%);
}

.range-label {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

/* 持仓行点击效果 */
.pos-row {
  cursor: pointer;
  transition: background 0.12s;
}

.pos-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

/* 开仓时间列 */
.time-cell {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 平仓按钮 */
.close-btn {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-down);
  background: transparent;
  color: var(--color-down);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.12s;
}

.close-btn:hover {
  background: rgba(246, 70, 93, 0.12);
}

.close-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 窄屏（手机）自适应 */
@media (max-width: 960px) {
  .mobile-shell {
    padding: 16px;
    border-radius: 24px;
  }

  .hero-card,
  .support-grid,
  .market-row {
    grid-template-columns: 1fr;
  }

  .market-price,
  .market-change {
    justify-self: start;
    text-align: left;
  }

  .quick-actions {
    flex-direction: column;
  }
}
</style>

<style scoped>
/* ============================================================
   桌面端首页布局
   原来的样式是移动端外壳（760px 居中、底部 dock），
   这里用桌面网格覆盖，同时保留 <=760px 的手机布局。
   ============================================================ */

.home-page {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.9fr);
  gap: 16px;
  align-items: start;
}

/* 让原移动端外壳和辅助区在桌面端变成 grid 容器，不额外产生包裹层 */
.home-content,
.support-grid {
  display: contents;
}

.home-toolbar {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.toolbar-copy {
  min-width: 0;
}

.home-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
}

.home-subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.search-wrap {
  position: relative;
  width: min(460px, 100%);
  flex: 0 1 460px;
}

.search-bar {
  margin: 0;
  padding: 9px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
}

.search-icon {
  font-size: 18px;
}

.search-input {
  font-size: 14px;
}

.search-clear {
  width: 24px;
  height: 24px;
}

.search-results {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  left: 0;
  z-index: 60;
  max-height: 360px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: 0 18px 40px rgba(2, 6, 12, 0.35);
}

.search-result {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto 68px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.search-result:hover {
  background: var(--bg-soft);
}

.search-result-main {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.search-result-main strong {
  font-size: 14px;
}

.search-result-main span {
  color: var(--text-secondary);
  font-size: 12px;
}

.search-result-price {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.search-result-change {
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.search-empty {
  padding: 16px;
  color: var(--text-secondary);
  text-align: center;
  font-size: 13px;
}

/* 资产卡 */
.hero-card {
  grid-column: 1;
  grid-row: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin: 0;
  padding: 22px;
}

.hero-label {
  font-size: 13px;
}

.hero-balance {
  margin-top: 8px;
  font-size: clamp(32px, 4vw, 48px);
}

.hero-yield {
  margin-top: 10px;
  font-size: 14px;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-actions .action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 42px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
}

/* 当前品种卡 */
.hero-market-card {
  grid-column: 2;
  grid-row: 2;
  margin: 0;
  padding: 18px 20px;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.hero-side .ghost-btn {
  padding: 7px 12px;
  font-size: 12px;
}

.hero-symbol {
  font-size: 22px;
}

.hero-compact-row {
  margin-top: 8px;
}

.price-large {
  font-size: 30px;
}

/* 权益曲线 */
.equity-curve-card {
  grid-column: 1;
  grid-row: 3;
  margin: 0;
  padding: 18px;
}

/* 热门市场 */
.market-panel {
  grid-column: 2;
  grid-row: 3 / span 2;
  margin: 0;
  padding: 18px;
}

.market-panel .section-head {
  margin-bottom: 4px;
}

.market-list {
  gap: 0;
  margin: 0;
}

.market-row {
  grid-template-columns: minmax(0, 1fr) auto 82px;
  gap: 10px;
  padding: 10px 6px;
  border-bottom: 1px solid var(--border-color);
}

.market-row:last-child {
  border-bottom: none;
}

.coin-avatar {
  width: 34px;
  height: 34px;
  font-size: 14px;
}

.market-meta {
  gap: 10px;
}

.market-symbol {
  font-size: 14px;
}

.market-sub,
.market-turnover {
  margin-top: 2px;
  font-size: 11px;
}

.market-price {
  font-size: 13px;
  text-align: right;
}

.market-change {
  justify-self: end;
  min-width: 72px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
}

/* 持仓 / 委托 / 账户摘要 */
.positions-panel {
  grid-column: 1;
  grid-row: 4;
  min-width: 0;
  overflow-x: auto;
}

.positions-panel .table th,
.positions-panel .table td,
.recent-orders .table th,
.recent-orders .table td {
  padding: 10px 6px;
  font-size: 12px;
}

.recent-orders {
  grid-column: 1;
  grid-row: 5;
  min-width: 0;
  overflow-x: auto;
}

.account-summary {
  grid-column: 2;
  grid-row: 5;
}

/* 股票代币：独立全宽板块 */
.stock-panel {
  grid-column: 1 / -1;
  grid-row: 6;
}

.stock-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stock-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.stock-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-soft);
  transition: border-color 0.15s ease;
}

.stock-row:hover {
  border-color: rgba(187, 255, 39, 0.35);
}

.stock-meta {
  min-width: 0;
}

.stock-symbol {
  font-size: 13px;
  font-weight: 700;
}

.stock-sub {
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stock-price {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.stock-change {
  min-width: 62px;
  font-size: 12px;
  font-weight: 700;
  text-align: right;
}

.asset-badge {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.16);
  color: #60a5fa;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}

.account-summary .summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  min-width: 0;
  padding: 12px;
  border-radius: 10px;
}

.summary-item span {
  font-size: 11px;
}

.summary-item strong {
  margin-top: 6px;
  font-size: 14px;
}

/* 桌面端隐藏手机底部导航 */
.bottom-dock {
  display: none;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-head .section-title {
  margin-bottom: 0;
}

/* 中等宽度：单列堆叠 */
@media (max-width: 1180px) {
  .home-page {
    grid-template-columns: 1fr;
  }

  .home-toolbar,
  .hero-card,
  .hero-market-card,
  .equity-curve-card,
  .market-panel,
  .positions-panel,
  .stock-panel,
  .recent-orders,
  .account-summary {
    grid-column: 1;
    grid-row: auto;
  }

  .hero-card,
  .hero-market-card,
  .equity-curve-card,
  .market-panel,
  .positions-panel,
  .stock-panel {
    margin-top: 0;
  }

  .stock-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 手机端：恢复单列 + 底部 dock */
@media (max-width: 760px) {
  .home-page {
    display: block;
  }

  .home-content {
    display: block;
  }

  .support-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 16px;
  }

  .home-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .search-wrap {
    width: 100%;
    flex: none;
  }

  .hero-card {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    margin-top: 16px;
  }

  .hero-balance {
    font-size: 42px;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-actions .action-btn {
    width: 100%;
  }

  .hero-market-card,
  .equity-curve-card,
  .market-panel,
  .positions-panel,
  .stock-panel {
    margin-top: 16px;
  }

  .stock-grid {
    grid-template-columns: 1fr;
  }

  .market-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .market-price {
    display: none;
  }

  .bottom-dock {
    display: flex;
    justify-content: space-between;
    margin-top: 28px;
    padding: 14px 12px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}
</style>
