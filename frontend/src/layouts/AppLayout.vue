<template>
  <div class="shell">
    <aside class="sidebar card">
      <div class="sidebar-title">
        <div class="brand">{{ $t('layout.brand') }}</div>
        <div class="muted">{{ $t('layout.subtitle') }}</div>
      </div>

      <nav class="nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item">
          {{ $t(item.labelKey) }}
        </RouterLink>
      </nav>
    </aside>

    <div class="content">
      <header class="topbar card">
        <div class="topbar-stats">
          <div>
            <div class="stat-label">{{ $t('layout.accountEquity') }}</div>
            <div class="stat-value">{{ formatCurrency(assetSnapshot?.equity) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('layout.availableBalance') }}</div>
            <div class="stat-value">{{ formatCurrency(assetSnapshot?.availableBalance) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('layout.unrealizedPnl') }}</div>
            <div :class="['stat-value', unrealizedPnlClass]">{{ formatSignedCurrency(totalUnrealizedPnl) }}</div>
          </div>
        </div>
      </header>

      <!-- 手机端非首页的导航；首页使用底部 dock -->
      <nav v-if="route.name !== 'home'" class="mobile-nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="mobile-nav-item">
          {{ $t(item.labelKey) }}
        </RouterLink>
      </nav>

      <div v-if="globalError" class="status-text">{{ globalError }}</div>

      <main v-if="appReady" class="main-view">
        <RouterView />
      </main>
      <main v-else class="main-view">
        <div class="card empty-state">{{ $t('common.loading') }}</div>
      </main>
    </div>
  </div>

  <ConfirmModal
    :open="modeConfirmOpen"
    :title="modeConfirmTitle"
    :description="modeConfirmDescription"
    :warning-text="modeConfirmWarning"
    :loading="modeStore.loading"
    :confirm-enabled="modeConfirmEnabled"
    confirm-text-key="common.confirmSwitch"
    cancel-text-key="common.cancel"
    @cancel="modeConfirmOpen = false"
    @confirm="handleToggleMode()"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAssetStore } from '../stores/assets';
import { useAuthStore } from '../stores/auth';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import { useCurrencyStore } from '../stores/currency';
import { formatCurrency, formatSignedCurrency, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const assetStore = useAssetStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const currencyStore = useCurrencyStore();
const router = useRouter();
const route = useRoute();
const modeConfirmOpen = ref(false);
const appReady = ref(false);

const navItems = [
  { to: '/', labelKey: 'nav.home' },
  { to: '/markets', labelKey: 'nav.explore' },
  { to: '/prediction', labelKey: 'nav.prediction' },
  { to: '/trade/BTC-USDT-SWAP', labelKey: 'nav.trade' },
  { to: '/spot/BTC-USDT', labelKey: 'nav.spot' },
  { to: '/positions', labelKey: 'nav.positions' },
  { to: '/assets', labelKey: 'nav.assets' },
  { to: '/orders/history', labelKey: 'nav.orderHistory' },
  { to: '/settings', labelKey: 'nav.settings' },
];

const assetSnapshot = computed(() => assetStore.snapshot);
const totalUnrealizedPnl = computed(
  () => assetSnapshot.value?.totalUnrealizedPnl ?? assetSnapshot.value?.unrealizedPnl,
);
const unrealizedPnlClass = computed(() => getTrendClass(totalUnrealizedPnl.value));
const globalError = computed(() => authStore.error || modeStore.error || assetStore.error || exchangeStore.error);

const modeConfirmTitle = computed(() => $t('layout.switchConfirmTitle'));
const modeConfirmEnabled = computed(() => modeStore.mode === 'live' || exchangeStore.hasActiveAccount);
const modeConfirmDescription = computed(() =>
  modeStore.mode === 'simulation'
    ? $t('layout.switchDescToLive')
    : $t('layout.switchDescToSim'),
);
const modeConfirmWarning = computed(() =>
  modeStore.mode === 'simulation'
    ? modeConfirmEnabled.value
      ? $t('layout.switchWarningLive')
      : $t('layout.switchWarningNoApi')
    : '',
);

async function loadGlobalData() {
  try {
    await Promise.all([authStore.fetchMe(), modeStore.fetchMode(), exchangeStore.fetchAccounts()]);
    await assetStore.fetchAssets(modeStore.mode);
  } finally {
    // 等能力矩阵就绪后再挂载页面，避免页面先按 simulation 取到模拟数据。
    appReady.value = true;
  }
}

function openModeConfirm() {
  modeConfirmOpen.value = true;
}

async function handleToggleMode() {
  if (!modeConfirmEnabled.value) return;
  const changed = await modeStore.toggleMode();
  if (changed) {
    modeConfirmOpen.value = false;
    await assetStore.fetchAssets(modeStore.mode);
  }
}

onMounted(() => {
  void loadGlobalData();
  currencyStore.initQuote();
  currencyStore.fetchRate();
});

function handleLogout() {
  authStore.logout();
  router.replace('/login');
}
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 0;
  border-right: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-title {
  margin-bottom: 4px;
}

.brand {
  font-size: 15px;
  font-weight: 800;
}

.muted {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 1px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.nav-item {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.12s;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-soft);
}

.nav-item.router-link-active {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  min-width: 0;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 10px;
}

.topbar-stats {
  display: flex;
  gap: 20px;
}

.stat-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-value.up { color: #00c087; }
.stat-value.down { color: #f6465d; }

.main-view {
  flex: 1;
  min-width: 0;
}

.status-text {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>

<style scoped>
/* 手机端：隐藏左侧栏，内容占满宽度；首页保留底部 dock 导航 */
.mobile-nav {
  display: none;
}

@media (max-width: 760px) {
  .shell {
    display: block;
  }

  .sidebar {
    display: none;
  }

  .content {
    padding: 10px;
    gap: 10px;
  }

  .topbar {
    padding: 10px 12px;
    overflow-x: auto;
  }

  .topbar-stats {
    gap: 14px;
    min-width: max-content;
  }

  .stat-label {
    font-size: 9px;
  }

  .stat-value {
    font-size: 12px;
  }

  .mobile-nav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 4px;
    scrollbar-width: none;
  }

  .mobile-nav::-webkit-scrollbar {
    display: none;
  }

  .mobile-nav-item {
    flex: 0 0 auto;
    padding: 7px 11px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
  }

  .mobile-nav-item.router-link-active {
    border-color: rgba(187, 255, 39, 0.36);
    background: rgba(187, 255, 39, 0.12);
    color: #bbff27;
  }
}
</style>
