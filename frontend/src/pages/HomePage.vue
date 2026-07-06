<template>
  <!-- 首页容器 -->
  <div class="page home-page">
    <!-- 移动端外壳 -->
    <section class="mobile-shell">
      <!-- 移动端顶部栏 -->
      <header class="mobile-topbar">
        <div class="topbar-actions">
          <button class="icon-btn">扫</button>
        </div>
      </header>

      <!-- 搜索栏（热搜） -->
      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <span class="search-text">🔥 {{ trendingSymbol }} {{ $t('home.hotSearch') }}</span>
      </div>

      <!-- 总资产卡片 -->
      <section class="hero-card">
        <div class="hero-copy">
          <div class="hero-label">
            {{ $t('home.totalAssets') }}
            <span class="eye-dot"></span>
          </div>
          <div class="hero-balance">
            {{ formatCurrency(assetStore.snapshot?.equity) }}
          </div>
          <div class="hero-yield">
            {{ $t('home.yearlyReturn') }}
            <span :class="getTrendClass(assetStore.snapshot?.unrealizedPnl)">
              {{ formatSignedCurrency(assetStore.snapshot?.unrealizedPnl) }}
              ({{ yieldPercent }})
            </span>
          </div>
        </div>
      </section>

      <!-- 资金曲线图 -->
      <section class="card equity-curve-card">
        <EquityChart v-model:mode="modeStore.mode" range="30d" />
      </section>

      <!-- 紧凑行情卡 -->
      <section class="card hero-market-card">
        <div class="hero-head">
          <div class="hero-symbol-line">
            <h1 class="hero-symbol">{{ currentBaseSymbol }}</h1>
            <span class="hero-quote">/ {{ currentQuoteSymbol }}</span>
            <span :class="['hero-change', getTrendClass(currentTicker?.priceChangePercent24h)]">
              {{ formatPercent(currentTicker?.priceChangePercent24h) }}
            </span>
          </div>
          <div class="hero-mode-text">{{ $t('trade.currentMode') }}：{{ modeStore.modeLabel }}</div>
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

      <!-- 行情排行榜切换标签 -->
      <section class="market-tabs">
        <button v-for="tab in rankingTabs" :key="tab" :class="['tab-chip', { active: tab === '热门榜' }]">
          {{ tab }}
        </button>
        <button class="tab-arrow">›</button>
      </section>

      <!-- 现货 / 合约切换 -->
      <section class="spot-switch">
        <button class="spot-pill active">现货</button>
        <button class="spot-pill">合约</button>
      </section>

      <!-- 热门市场列表 -->
      <section class="market-list">
        <RouterLink v-for="item in featuredMarkets" :key="item.symbol" :to="`/trade/${item.symbol}`" class="market-row">
          <div class="market-meta">
            <div :class="['coin-avatar', coinTone(item.symbol)]">{{ coinLabel(item.symbol) }}</div>
            <div>
              <div class="market-symbol">{{ splitSymbol(item.symbol).base }} <span>/ {{ splitSymbol(item.symbol).quote }}</span></div>
              <div class="market-sub">{{ formatVolumeCompact(item.volume24h) }}</div>
            </div>
          </div>

          <div class="market-price">
            <div>{{ item.lastPrice }}</div>
            <div class="market-turnover">{{ formatTurnover(item.volume24h) }}</div>
          </div>

          <div :class="['market-change', getTrendClass(item.priceChangePercent24h)]">
            {{ formatPercent(item.priceChangePercent24h) }}
          </div>
        </RouterLink>
      </section>

      <!-- 仓位快照 -->
      <section class="holdings-strip">
        <div class="strip-title">{{ $t('home.positionsSnapshot') }}</div>
        <div v-if="recentPositions.length" class="holdings-list">
          <div v-for="item in recentPositions" :key="item.id" class="holding-pill">
            <span>{{ item.symbol }}</span>
            <strong :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</strong>
          </div>
        </div>
        <div v-else class="status-text">{{ $t('home.noPositionData') }}</div>
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
      <div class="card">
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
              <td>{{ item.orderId }}</td>
              <td>{{ item.symbol }}</td>
              <td>{{ item.orderType }}</td>
              <td>{{ item.side === 'long' ? '多' : '空' }}</td>
              <td>{{ item.status }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 账户摘要 -->
      <div class="card">
        <h2 class="section-title">{{ $t('home.accountSummary') }}</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span>{{ $t('home.currentMode') }}</span>
            <strong>{{ modeStore.modeLabel }}</strong>
          </div>
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
  </div>
</template>

<script setup lang="ts">
// Vue 响应式工具与侦听器
import { computed, watch } from 'vue';
// Vue Router 导航组件
import { RouterLink } from 'vue-router';
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
// 国际化
import { $t } from '../utils/i18n';
// 数值格式化与涨跌颜色工具函数
import { formatPercent, formatSignedValue, formatSignedCurrency, formatCurrency, formatCompactVolume, getTrendClass } from '../utils/format';

// 各 Store 实例
const assetStore = useAssetStore();
const marketStore = useMarketStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

// 排行榜标签列表
const rankingTabs = ['自选', '热门榜', '新币榜', 'TradFi', 'DEX'];

// 热门市场（取前 5 条）
const featuredMarkets = computed(() => marketStore.tickers.slice(0, 5));
// 最近持仓（取前 4 条）
const recentPositions = computed(() => positionStore.positions.slice(0, 4));
// 历史订单（取前 5 条）
const recentOrders = computed(() => orderStore.historyOrders.slice(0, 5));
// 当前热搜品种
const trendingSymbol = computed(() => featuredMarkets.value[3]?.symbol.split('-')[0] || 'ZEC');
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

// 格式化成交易额
function formatTurnover(value?: string) {
  const amount = Number(value || 0) * 18.85;

  if (amount >= 1000000) {
    return `₮${(amount / 1000000).toFixed(2)}M`;
  }

  if (amount >= 1000) {
    return `₮${(amount / 1000).toFixed(2)}K`;
  }

  return `₮${amount.toFixed(0)}`;
}

// 品种图标首字母
function coinLabel(symbol: string) {
  return splitSymbol(symbol).base.slice(0, 1);
}

// 品种图标色调
function coinTone(symbol: string) {
  const base = splitSymbol(symbol).base;

  if (base === 'BTC') {
    return 'coin-btc';
  }

  if (base === 'ETH') {
    return 'coin-eth';
  }

  if (base === 'SOL') {
    return 'coin-sol';
  }

  return 'coin-alt';
}

// 行情卡计算属性
const currentTicker = computed(() => marketStore.tickers[0] || null);
const currentBaseSymbol = computed(() => {
  const s = currentTicker.value?.symbol || 'BTC-USDT-SWAP';
  return s.includes('-') ? s.split('-')[0] : s.replace('USDT', '');
});
const currentQuoteSymbol = computed(() => 'USDT');
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

/* 弹性布局公用 */
.mobile-topbar,
.topbar-actions,
.mode-switch,
.market-tabs,
.spot-switch,
.quick-actions,
.summary-grid,
.holdings-list,
.bottom-dock {
  display: flex;
  gap: 12px;
}

/* 两端对齐公用 */
.mobile-topbar,
.section-head {
  align-items: center;
  justify-content: space-between;
}

/* 无边框按钮公用 */
.icon-btn,
.mode-pill,
.tab-chip,
.tab-arrow,
.spot-pill {
  border: none;
  cursor: pointer;
}

/* 圆形图标按钮 */
.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  font-size: 18px;
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
  padding: 16px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
}

/* 搜索图标 */
.search-icon {
  font-size: 22px;
}

/* 热搜文本 */
.search-text {
  color: var(--text-secondary);
  font-size: 18px;
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
.holding-pill,
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

/* 持仓快照栏 */
.holdings-strip {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 栏目标题 */
.strip-title {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 持仓列表 */
.holdings-list {
  flex-wrap: wrap;
}

/* 持仓胶囊 */
.holding-pill {
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
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

.hero-mode-text {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
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

/* 窄屏自适应 */
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
