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

        <div class="topbar-actions">
          <DesktopBackendChip />
          <button
            class="notification-bell"
            type="button"
            :aria-label="$t('notifications.title')"
            @click="notificationStore.togglePanel()"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span v-if="notificationStore.hasUnread" class="notification-dot"></span>
          </button>

          <div v-if="notificationStore.panelOpen" class="notification-panel card">
            <div class="notification-panel-head">
              <strong>{{ $t('notifications.title') }}</strong>
              <div class="notification-panel-actions">
                <button
                  v-if="notificationStore.hasUnread"
                  class="notification-link"
                  type="button"
                  @click="notificationStore.markAllRead()"
                >
                  {{ $t('notifications.markAllRead') }}
                </button>
                <button class="notification-close" type="button" @click="notificationStore.panelOpen = false">×</button>
              </div>
            </div>
            <div class="notification-list">
              <button
                v-for="item in notificationStore.notifications"
                :key="item.id"
                :class="['notification-item', { unread: !item.read }]"
                type="button"
                @click="notificationStore.markRead(item.id)"
              >
                <span :class="['notification-severity', `notification-${item.severity}`]"></span>
                <span class="notification-content">
                  <span class="notification-title">{{ item.title }}</span>
                  <span class="notification-message">{{ item.message }}</span>
                  <span class="notification-time">{{ formatNotificationTime(item.createdAt) }}</span>
                </span>
              </button>
              <div v-if="!notificationStore.notifications.length" class="empty-state">
                {{ $t('notifications.empty') }}
              </div>
            </div>
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
      <div v-if="realtimeStore.disconnected" class="realtime-banner">
        {{ $t('realtime.disconnected') }}
      </div>
      <div v-if="staleDataCount" class="stale-data-banner">
        {{ $t('api.staleData') }}
      </div>

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

  <div v-if="notificationStore.toast" :class="['notification-toast', `toast-${notificationStore.toast.severity}`]">
    <div class="notification-toast-icon">!</div>
    <div class="notification-toast-body">
      <strong>{{ notificationStore.toast.title }}</strong>
      <p>{{ notificationStore.toast.message }}</p>
    </div>
    <button class="notification-toast-close" type="button" @click="notificationStore.dismissToast()">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import DesktopBackendChip from '../components/system/DesktopBackendChip.vue';
import { useAssetStore } from '../stores/assets';
import { useAuthStore } from '../stores/auth';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import { useCurrencyStore } from '../stores/currency';
import { useNotificationStore } from '../stores/notifications';
import { useRealtimeStore } from '../stores/realtime';
import { apiStatus } from '../utils/api-status';
import { formatCurrency, formatSignedCurrency, getTrendClass } from '../utils/format';
import { $t } from '../utils/i18n';

const assetStore = useAssetStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const currencyStore = useCurrencyStore();
const notificationStore = useNotificationStore();
const realtimeStore = useRealtimeStore();
const staleDataCount = computed(() => Object.keys(apiStatus.stale).length);
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
  notificationStore.startPolling();
  realtimeStore.start();
});

onUnmounted(() => {
  notificationStore.stopPolling();
  realtimeStore.stop();
});

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function handleLogout() {
  notificationStore.stopPolling();
  realtimeStore.stop();
  await authStore.logout();
  await router.replace('/login');
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

.topbar-actions {
  position: relative;
  display: flex;
  align-items: center;
}

.notification-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  cursor: pointer;
}

.notification-bell:hover {
  color: var(--text-primary);
  border-color: rgba(187, 255, 39, 0.35);
}

.notification-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff4d4f;
  box-shadow: 0 0 0 2px var(--bg-soft);
}

.notification-panel {
  position: absolute;
  top: 44px;
  right: 0;
  z-index: 45;
  width: min(92vw, 380px);
  max-height: 480px;
  overflow: hidden;
  padding: 0;
}

.notification-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.notification-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-link,
.notification-close {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
}

.notification-close {
  font-size: 18px;
  line-height: 1;
}

.notification-list {
  max-height: 420px;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  gap: 9px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.notification-item.unread {
  background: rgba(187, 255, 39, 0.035);
}

.notification-item:hover {
  background: var(--bg-soft);
}

.notification-severity {
  width: 4px;
  min-width: 4px;
  border-radius: 999px;
  margin-top: 2px;
  background: var(--text-secondary);
}

.notification-danger { background: #ff4d4f; }
.notification-warning { background: #f5a623; }
.notification-success { background: #00c087; }
.notification-info { background: #4d9fff; }

.notification-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.notification-title {
  font-size: 12px;
  font-weight: 700;
}

.notification-message {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.notification-time {
  color: var(--text-tertiary);
  font-size: 10px;
}

.notification-toast {
  position: fixed;
  top: 76px;
  right: 20px;
  z-index: 95;
  display: flex;
  gap: 10px;
  width: min(92vw, 420px);
  padding: 14px;
  border: 1px solid var(--border-color);
  border-left: 4px solid #f5a623;
  border-radius: 12px;
  background: var(--bg-card);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.4);
}

.notification-toast.toast-danger { border-left-color: #ff4d4f; }
.notification-toast.toast-warning { border-left-color: #f5a623; }
.notification-toast.toast-success { border-left-color: #00c087; }
.notification-toast.toast-info { border-left-color: #4d9fff; }

.notification-toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(245, 166, 35, 0.16);
  color: #f5a623;
  font-weight: 900;
}

.toast-danger .notification-toast-icon {
  background: rgba(255, 77, 79, 0.16);
  color: #ff6b6b;
}

.toast-success .notification-toast-icon {
  background: rgba(0, 192, 135, 0.16);
  color: #00c087;
}

.notification-toast-body {
  flex: 1;
  min-width: 0;
}

.notification-toast-body strong {
  font-size: 13px;
}

.notification-toast-body p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.notification-toast-close {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
}

.realtime-banner {
  margin: 0 0 10px;
  padding: 8px 12px;
  border: 1px solid rgba(245, 166, 35, 0.35);
  border-radius: 8px;
  background: rgba(245, 166, 35, 0.1);
  color: var(--color-warning);
  font-size: 12px;
}

.stale-data-banner {
  margin: 0 0 10px;
  padding: 8px 12px;
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  background: rgba(64, 158, 255, 0.08);
  color: #7db8ff;
  font-size: 12px;
}

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
