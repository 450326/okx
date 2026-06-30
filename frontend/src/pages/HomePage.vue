<template>
  <!-- 首页容器 -->
  <div class="page home-page">
    <!-- 移动端外壳 -->
    <section class="mobile-shell">
      <!-- 移动端顶部栏 -->
      <header class="mobile-topbar">
        <button class="icon-btn">◧</button>
        <!-- 模式切换 -->
        <div class="mode-switch">
          <button class="mode-pill active">交易所</button>
          <button class="mode-pill">Web3</button>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn">礼</button>
          <button class="icon-btn">扫</button>
        </div>
      </header>

      <!-- 搜索栏（热搜） -->
      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <span class="search-text">🔥 {{ trendingSymbol }} 当前热搜</span>
      </div>

      <!-- 总资产卡片 -->
      <section class="hero-card">
        <div class="hero-copy">
          <div class="hero-label">
            总资产估值
            <span class="eye-dot"></span>
          </div>
          <div class="hero-balance">
            {{ assetStore.snapshot?.equity || '--' }}
            <span>USDT</span>
          </div>
          <div class="hero-yield">
            一年收益
            <span :class="getTrendClass(assetStore.snapshot?.unrealizedPnl)">
              {{ formatSignedValue(assetStore.snapshot?.unrealizedPnl) }}
              ({{ yieldPercent }})
            </span>
          </div>
        </div>
      </section>

      <!-- 资金曲线图 -->
      <section class="card equity-curve-card">
        <EquityChart v-model:mode="modeStore.mode" range="30d" />
      </section>

      <!-- 快捷操作区 -->
      <section class="quick-actions">
        <button class="action-btn action-primary">链上充币</button>
        <button class="action-btn action-primary">C2C 买币</button>
        <button class="action-btn action-secondary">划转资金</button>
      </section>

      <!-- 活动推广卡片 -->
      <section class="promo-card">
        <div class="promo-cover">
          <span class="promo-square"></span>
          <span class="promo-square secondary"></span>
          <span class="promo-vs">VS</span>
        </div>
        <div class="promo-content">
          <div class="promo-title">加码 150 万个 OFC</div>
          <div class="promo-desc">预测 6.16 西班牙 vs 佛得角比赛结果，即刻参与瓜分奖励</div>
        </div>
        <div class="promo-index">1/8</div>
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
        <div class="strip-title">仓位快照</div>
        <div v-if="recentPositions.length" class="holdings-list">
          <div v-for="item in recentPositions" :key="item.id" class="holding-pill">
            <span>{{ item.symbol }}</span>
            <strong :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</strong>
          </div>
        </div>
        <div v-else class="status-text">暂无持仓数据</div>
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
          <h2 class="section-title">最近订单</h2>
          <RouterLink class="ghost-btn" to="/orders/history">查看全部</RouterLink>
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
        <h2 class="section-title">账户摘要</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span>当前模式</span>
            <strong>{{ modeStore.modeLabel }}</strong>
          </div>
          <div class="summary-item">
            <span>可用余额</span>
            <strong>{{ assetStore.snapshot?.availableBalance || '--' }} USDT</strong>
          </div>
          <div class="summary-item">
            <span>最近下单</span>
            <strong>{{ recentOrders[0]?.symbol || '暂无' }}</strong>
          </div>
          <div class="summary-item">
            <span>活跃仓位</span>
            <strong>{{ recentPositions.length }} 个</strong>
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
// 数值格式化与涨跌颜色工具函数
import { formatPercent, formatSignedValue, getTrendClass } from '../utils/format';

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

/* 推广卡片 */
.promo-card {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  margin-top: 24px;
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
}

/* 资金曲线卡片 */
.equity-curve-card {
  margin-top: 24px;
  padding: 24px;
}

/* 推广封面 */
.promo-cover {
  position: relative;
  height: 92px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
  overflow: hidden;
}

/* 推广方块装饰 */
.promo-square {
  position: absolute;
  left: 12px;
  top: 12px;
  width: 28px;
  height: 28px;
  background: #bbff27;
}

.promo-square.secondary {
  left: 36px;
  top: 36px;
  background: rgba(255, 255, 255, 0.2);
}

/* VS 文字 */
.promo-vs {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 44px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.22);
}

/* 推广标题 */
.promo-title {
  color: #f6a02d;
  font-size: 18px;
  font-weight: 700;
}

/* 推广描述 */
.promo-desc {
  margin-top: 8px;
  color: #eef2f7;
  font-size: 17px;
  line-height: 1.55;
}

/* 推广序号 */
.promo-index {
  align-self: start;
  color: var(--text-secondary);
  font-size: 18px;
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

  .promo-card {
    grid-template-columns: 72px 1fr;
  }

  .promo-index {
    display: none;
  }
}
</style>
