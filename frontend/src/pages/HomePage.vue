<template>
  <div class="page home-page">
    <section class="mobile-shell">
      <header class="mobile-topbar">
        <button class="icon-btn">◧</button>
        <div class="mode-switch">
          <button class="mode-pill active">交易所</button>
          <button class="mode-pill">Web3</button>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn">礼</button>
          <button class="icon-btn">扫</button>
        </div>
      </header>

      <div class="search-bar">
        <span class="search-icon">⌕</span>
        <span class="search-text">🔥 {{ trendingSymbol }} 当前热搜</span>
      </div>

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

        <div class="hero-chart">
          <div
            v-for="(height, index) in heroBars"
            :key="`bar-${index}`"
            class="hero-bar"
            :style="{ height: `${height}%` }"
          ></div>
        </div>
      </section>

      <section class="quick-actions">
        <button class="action-btn action-primary">链上充币</button>
        <button class="action-btn action-primary">C2C 买币</button>
        <button class="action-btn action-secondary">划转资金</button>
      </section>

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

      <section class="market-tabs">
        <button v-for="tab in rankingTabs" :key="tab" :class="['tab-chip', { active: tab === '热门榜' }]">
          {{ tab }}
        </button>
        <button class="tab-arrow">›</button>
      </section>

      <section class="spot-switch">
        <button class="spot-pill active">现货</button>
        <button class="spot-pill">合约</button>
      </section>

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

    <section class="support-grid">
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
import { computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useAssetStore } from '../stores/assets';
import { useMarketStore } from '../stores/market';
import { useModeStore } from '../stores/mode';
import { useOrderStore } from '../stores/orders';
import { usePositionStore } from '../stores/positions';
import { formatPercent, formatSignedValue, getTrendClass } from '../utils/format';

const assetStore = useAssetStore();
const marketStore = useMarketStore();
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

const rankingTabs = ['自选', '热门榜', '新币榜', 'TradFi', 'DEX'];
const heroBars = [22, 35, 33, 48, 65, 71, 78, 74, 76, 73, 72, 86];

const featuredMarkets = computed(() => marketStore.tickers.slice(0, 5));
const recentPositions = computed(() => positionStore.positions.slice(0, 4));
const recentOrders = computed(() => orderStore.historyOrders.slice(0, 5));
const trendingSymbol = computed(() => featuredMarkets.value[3]?.symbol.split('-')[0] || 'ZEC');
const yieldPercent = computed(() => {
  const equity = Number(assetStore.snapshot?.equity || 0);
  const unrealized = Number(assetStore.snapshot?.unrealizedPnl || 0);
  const percent = equity ? (unrealized / equity) * 100 : 0;
  return formatPercent(percent);
});

function splitSymbol(symbol: string) {
  const [base = symbol, quote = 'USDT'] = symbol.split('-');
  return { base, quote };
}

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

function coinLabel(symbol: string) {
  return splitSymbol(symbol).base.slice(0, 1);
}

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

async function loadPageData() {
  await Promise.all([
    assetStore.fetchAssets(modeStore.mode),
    marketStore.fetchTickers(),
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchHistory(modeStore.mode),
  ]);
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
.home-page {
  gap: 20px;
}

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

.mobile-topbar,
.section-head {
  align-items: center;
  justify-content: space-between;
}

.icon-btn,
.mode-pill,
.tab-chip,
.tab-arrow,
.spot-pill {
  border: none;
  cursor: pointer;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  font-size: 18px;
}

.mode-switch {
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.mode-pill {
  padding: 10px 20px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 700;
}

.mode-pill.active,
.tab-chip.active,
.spot-pill.active {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 16px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.06);
}

.search-icon {
  font-size: 22px;
}

.search-text {
  color: var(--text-secondary);
  font-size: 18px;
}

.hero-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 16px;
  margin-top: 26px;
  align-items: end;
}

.hero-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 15px;
}

.eye-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.hero-balance {
  margin-top: 14px;
  font-size: clamp(42px, 7vw, 72px);
  font-weight: 800;
  line-height: 0.96;
}

.hero-balance span {
  font-size: 0.38em;
  font-weight: 700;
}

.hero-yield {
  margin-top: 18px;
  color: var(--text-secondary);
  font-size: 18px;
}

.hero-yield span {
  margin-left: 10px;
  font-weight: 700;
}

.hero-chart {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: end;
  gap: 5px;
  min-height: 120px;
  padding: 18px 0 8px;
}

.hero-bar {
  border-radius: 999px 999px 6px 6px;
  background: linear-gradient(180deg, #63ff98 0%, #1dd15f 100%);
  box-shadow: 0 0 18px rgba(64, 255, 148, 0.34);
}

.quick-actions {
  margin-top: 26px;
}

.action-btn {
  flex: 1;
  min-height: 58px;
  border: none;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 800;
}

.action-primary {
  background: #bbff27;
  color: #0d1205;
}

.action-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

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

.promo-cover {
  position: relative;
  height: 92px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
  overflow: hidden;
}

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

.promo-vs {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 44px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.22);
}

.promo-title {
  color: #f6a02d;
  font-size: 18px;
  font-weight: 700;
}

.promo-desc {
  margin-top: 8px;
  color: #eef2f7;
  font-size: 17px;
  line-height: 1.55;
}

.promo-index {
  align-self: start;
  color: var(--text-secondary);
  font-size: 18px;
}

.market-tabs {
  margin-top: 28px;
  flex-wrap: wrap;
}

.tab-chip,
.tab-arrow,
.spot-pill {
  padding: 10px 18px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
}

.tab-arrow {
  padding-inline: 12px;
}

.spot-switch {
  margin-top: 16px;
}

.market-list {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.market-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(110px, 0.8fr) 120px;
  gap: 14px;
  align-items: center;
  padding: 10px 0;
}

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

.coin-avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 900;
  color: #fff;
}

.coin-btc {
  background: linear-gradient(135deg, #ffb14c, #e98b18);
}

.coin-eth {
  background: linear-gradient(135deg, #7f9cff, #4b64f1);
}

.coin-sol {
  background: linear-gradient(135deg, #60ffd1, #6b4cff);
}

.coin-alt {
  background: linear-gradient(135deg, #e4e7ee, #646b7a);
}

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

.market-sub,
.market-turnover {
  margin-top: 6px;
  font-size: 15px;
}

.market-price {
  text-align: right;
  font-size: 18px;
  font-weight: 700;
}

.market-change {
  justify-self: end;
  min-width: 116px;
  padding: 14px 12px;
  border-radius: 14px;
  text-align: center;
  font-size: 18px;
  font-weight: 800;
}

.market-change.up {
  background: rgba(18, 195, 102, 0.92);
  color: #effff5;
}

.market-change.down {
  background: rgba(246, 70, 93, 0.9);
  color: #fff3f5;
}

.holdings-strip {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.strip-title {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}

.holdings-list {
  flex-wrap: wrap;
}

.holding-pill {
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.bottom-dock {
  justify-content: space-between;
  margin-top: 28px;
  padding: 14px 12px 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.dock-item {
  flex-direction: column;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.dock-item.active {
  color: #bbff27;
}

.dock-icon {
  font-size: 21px;
}

.dock-main {
  transform: translateY(-16px);
}

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

.support-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

.summary-grid {
  flex-wrap: wrap;
}

.summary-item {
  flex: 1 1 calc(50% - 12px);
  min-width: 180px;
  padding: 16px;
  border-radius: 18px;
  background: var(--bg-soft);
}

.summary-item span {
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
}

.summary-item strong {
  display: block;
  margin-top: 10px;
  font-size: 18px;
}

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
