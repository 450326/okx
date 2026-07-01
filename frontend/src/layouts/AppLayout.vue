<template>
  <div class="shell">
    <aside class="sidebar card">
      <div>
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
        <div>
          <div :class="['tag', { 'tag-live': modeStore.mode === 'live' }]">
            {{ modeStore.mode === 'simulation' ? $t('equity.simulation') : $t('equity.live') }}
          </div>
          <div class="topbar-stats">
            <div>
              <div class="stat-label">{{ $t('layout.accountEquity') }}</div>
              <div class="stat-value">{{ assetSnapshot?.equity || '--' }} {{ currencyLabel }}</div>
            </div>
            <div>
              <div class="stat-label">{{ $t('layout.availableBalance') }}</div>
              <div class="stat-value">
                {{ assetSnapshot?.availableBalance || '--' }} {{ currencyLabel }}
              </div>
            </div>
            <div>
              <div class="stat-label">{{ $t('layout.unrealizedPnl') }}</div>
              <div :class="['stat-value', unrealizedPnlClass]">
                {{ formattedUnrealizedPnl }} {{ currencyLabel }}
              </div>
            </div>
          </div>
          <div class="status-text">{{ authStore.user ? `${$t('layout.loggedIn')}: ${authStore.user.nickname}` : $t('layout.notLoggedIn') }}</div>
          <div v-if="globalError" class="status-text">{{ globalError }}</div>
        </div>

        <div class="panel-actions">
          <button class="ghost-btn" @click="themeStore.toggleTheme()">
            {{ $t('layout.theme') }}: {{ themeStore.theme === 'dark' ? $t('layout.dark') : $t('layout.light') }}
          </button>
          <button class="ghost-btn" :disabled="modeStore.loading" @click="openModeConfirm()">
            {{ $t('layout.switchTo') }}{{ modeStore.mode === 'simulation' ? $t('equity.live') : $t('equity.simulation') }}
          </button>
          <button class="primary-btn" @click="handleLogout">{{ userName }}{{ $t('layout.logout') }}</button>
        </div>
      </header>

      <main class="main-view">
        <RouterView />
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
import { RouterLink, RouterView, useRouter } from 'vue-router';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAssetStore } from '../stores/assets';
import { useAuthStore } from '../stores/auth';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import { useThemeStore } from '../stores/theme';
import { useCurrencyStore } from '../stores/currency';
import { formatSignedValue, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const assetStore = useAssetStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const themeStore = useThemeStore();
const currencyStore = useCurrencyStore();
const router = useRouter();
const modeConfirmOpen = ref(false);

const navItems = [
  { to: '/', labelKey: 'nav.home' },
  { to: '/markets', labelKey: 'nav.explore' },
  { to: '/trade/BTC-USDT-SWAP', labelKey: 'nav.trade' },
  { to: '/positions', labelKey: 'nav.positions' },
  { to: '/assets', labelKey: 'nav.assets' },
  { to: '/orders/history', labelKey: 'nav.orderHistory' },
];

const assetSnapshot = computed(() => assetStore.snapshot);
const userName = computed(() => {
  const name = authStore.user?.nickname;
  return name ? `${name} · ` : '';
});
const formattedUnrealizedPnl = computed(() => formatSignedValue(assetSnapshot.value?.unrealizedPnl));
const unrealizedPnlClass = computed(() => getTrendClass(assetSnapshot.value?.unrealizedPnl));
const globalError = computed(() => authStore.error || modeStore.error || assetStore.error || exchangeStore.error);
const currencyLabel = computed(() => {
  if (currencyStore.quote === 'USD') return '$';
  return assetSnapshot.value?.currency || 'USDT';
});

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
  await Promise.all([authStore.fetchMe(), modeStore.fetchMode(), exchangeStore.fetchAccounts()]);
  await assetStore.fetchAssets(modeStore.mode);
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
});

function handleLogout() {
  authStore.logout();
  router.replace('/login');
}
</script>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  min-height: 100vh;
  padding: 16px;
}

.sidebar {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 24px;
  align-content: start;
}

.brand {
  font-size: 24px;
  font-weight: 800;
}

.nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  padding: 12px 14px;
  border-radius: 12px;
  color: var(--text-secondary);
}

.nav-item.router-link-active {
  background: var(--bg-soft);
  color: var(--text-primary);
}

.content {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.topbar-stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.main-view {
  min-width: 0;
}

@media (max-width: 960px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    grid-template-rows: auto auto;
  }

  .nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .topbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
