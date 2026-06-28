<template>
  <div class="shell">
    <aside class="sidebar card">
      <div>
        <div class="brand">Futures Pro</div>
        <div class="muted">真实与模拟期货平台</div>
      </div>

      <nav class="nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <div class="content">
      <header class="topbar card">
        <div>
          <div :class="['tag', { 'tag-live': modeStore.mode === 'live' }]">{{ modeStore.modeLabel }}</div>
          <div class="topbar-stats">
            <div>
              <div class="stat-label">账户权益</div>
              <div class="stat-value">{{ assetSnapshot?.equity || '--' }} {{ assetSnapshot?.currency || 'USDT' }}</div>
            </div>
            <div>
              <div class="stat-label">可用余额</div>
              <div class="stat-value">
                {{ assetSnapshot?.availableBalance || '--' }} {{ assetSnapshot?.currency || 'USDT' }}
              </div>
            </div>
            <div>
              <div class="stat-label">未实现盈亏</div>
              <div :class="['stat-value', unrealizedPnlClass]">
                {{ formattedUnrealizedPnl }} {{ assetSnapshot?.currency || 'USDT' }}
              </div>
            </div>
          </div>
          <div class="status-text">{{ authStore.authLabel }}</div>
          <div v-if="globalError" class="status-text">{{ globalError }}</div>
        </div>

        <div class="panel-actions">
          <button class="ghost-btn" @click="themeStore.toggleTheme()">
            主题: {{ themeStore.theme === 'dark' ? '深色' : '浅色' }}
          </button>
          <button class="ghost-btn" :disabled="modeStore.loading" @click="openModeConfirm()">
            切换到{{ modeStore.mode === 'simulation' ? '真实交易' : '模拟交易' }}
          </button>
          <button class="primary-btn" :disabled="authStore.loading">{{ userName }}</button>
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
    confirm-text="确认切换"
    cancel-text="取消"
    @cancel="modeConfirmOpen = false"
    @confirm="handleToggleMode()"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAssetStore } from '../stores/assets';
import { useAuthStore } from '../stores/auth';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import { useThemeStore } from '../stores/theme';
import { formatSignedValue, getTrendClass } from '../utils/format';

const assetStore = useAssetStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const themeStore = useThemeStore();
const modeConfirmOpen = ref(false);

const navItems = [
  { to: '/', label: '首页' },
  { to: '/markets', label: '行情' },
  { to: '/trade/BTC-USDT-SWAP', label: '交易' },
  { to: '/positions', label: '持仓' },
  { to: '/assets', label: '资金' },
  { to: '/orders/history', label: '历史订单' },
];

const assetSnapshot = computed(() => assetStore.snapshot);
const userName = computed(() => authStore.user?.nickname || '未登录');
const formattedUnrealizedPnl = computed(() => formatSignedValue(assetSnapshot.value?.unrealizedPnl));
const unrealizedPnlClass = computed(() => getTrendClass(assetSnapshot.value?.unrealizedPnl));
const globalError = computed(() => authStore.error || modeStore.error || assetStore.error || exchangeStore.error);
const nextModeLabel = computed(() => (modeStore.mode === 'simulation' ? '真实交易' : '模拟交易'));
const modeConfirmTitle = computed(() => `切换到${nextModeLabel.value}`);
const modeConfirmEnabled = computed(() => modeStore.mode === 'live' || exchangeStore.hasActiveAccount);
const modeConfirmDescription = computed(() =>
  modeStore.mode === 'simulation'
    ? '切换到真实交易后，下单将进入真实交易流程并产生真实盈亏，请确认你已经了解相关风险。'
    : '切换回模拟交易后，后续下单与资产变化都只影响模拟账户。',
);
const modeConfirmWarning = computed(() =>
  modeStore.mode === 'simulation'
    ? modeConfirmEnabled.value
      ? '真实交易前请确认 API 绑定、杠杆设置与风险参数正确。'
      : '当前还没有可用的 OKX API 绑定，请先到资金页完成绑定。'
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
  if (!modeConfirmEnabled.value) {
    return;
  }

  const changed = await modeStore.toggleMode();

  if (changed) {
    modeConfirmOpen.value = false;
    await assetStore.fetchAssets(modeStore.mode);
  }
}

onMounted(() => {
  void loadGlobalData();
});
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
