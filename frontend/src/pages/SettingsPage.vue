<template>
  <div class="page settings-page">
    <div class="settings-inner">
      <h2 class="section-title">{{ $t('settings.title') }}</h2>

      <!-- 语言与货币 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.languageCurrency') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.language') }}</span>
          <LocaleSwitcher />
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.quoteCurrency') }}</span>
          <CurrencySwitcher />
        </div>
      </section>

      <!-- 账户安全 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.security') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.email') }}</span>
          <span class="settings-value">
            {{ authStore.user?.email || '--' }}
            <span :class="['security-badge', authStore.user?.emailVerified ? 'verified' : 'unverified']">
              {{ authStore.user?.emailVerified ? $t('settings.emailVerified') : $t('settings.emailUnverified') }}
            </span>
          </span>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.twoFactor') }}</span>
          <div class="settings-actions-row">
            <span :class="['security-badge', authStore.user?.twoFactorEnabled ? 'verified' : 'unverified']">
              {{ authStore.user?.twoFactorEnabled ? $t('settings.twoFactorEnabled') : $t('settings.twoFactorDisabled') }}
            </span>
            <button
              v-if="!authStore.user?.twoFactorEnabled"
              class="ghost-btn"
              :disabled="totpBusy"
              @click="startTotpSetup"
            >
              {{ $t('settings.enableTwoFactor') }}
            </button>
          </div>
        </div>
        <div v-if="totpSetupSecret" class="totp-setup">
          <p class="settings-label">{{ $t('settings.totpSecretHint') }}</p>
          <code class="totp-secret">{{ totpSetupSecret }}</code>
          <p class="settings-label">{{ totpSetupUrl }}</p>
          <div class="settings-actions-row">
            <input v-model="totpSetupCode" class="settings-input" maxlength="6" placeholder="000000" />
            <button class="ghost-btn" :disabled="totpBusy || totpSetupCode.length !== 6" @click="enableTotp">
              {{ $t('settings.confirm') }}
            </button>
          </div>
        </div>
        <div v-if="authStore.user?.twoFactorEnabled" class="settings-actions-row">
          <input v-model="totpDisableCode" class="settings-input" maxlength="6" :placeholder="$t('settings.totpCode')" />
          <button class="ghost-btn" :disabled="totpBusy || totpDisableCode.length !== 6" @click="disableTotp">
            {{ $t('settings.disableTwoFactor') }}
          </button>
        </div>
        <div v-if="securityError" class="status-text error-text">{{ securityError }}</div>
      </section>

      <!-- 外观与模式 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.appearance') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.theme') }}</span>
          <div class="settings-actions-row">
            <button class="ghost-btn" @click="themeStore.toggleTheme()">
              {{ themeStore.theme === 'dark' ? $t('layout.dark') : $t('layout.light') }}
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.tradeMode') }}</span>
          <div class="settings-actions-row">
            <span :class="['mode-state-badge', modeStore.state]">{{ modeStateLabel }}</span>
            <button class="ghost-btn" :disabled="modeStore.loading" @click="openModeConfirm()">
              {{ $t('settings.switchAccount') }}
            </button>
            <button
              v-if="modeStore.state === 'live_readonly'"
              class="ghost-btn"
              :disabled="modeStore.loading || !modeStore.capabilities.canEnterLiveTrading"
              @click="handleEnableLiveTrading"
            >
              {{ $t('settings.enableLiveTrading') }}
            </button>
            <button
              v-if="modeStore.state === 'live_trading'"
              class="ghost-btn"
              :disabled="modeStore.loading"
              @click="handleDisableLiveTrading"
            >
              {{ $t('settings.disableLiveTrading') }}
            </button>
          </div>
        </div>
        <p v-if="modeStore.state === 'live_readonly'" class="status-text mode-hint">
          {{ $t('settings.liveTradingHint') }}
        </p>
        <div v-if="modeStore.isSuper && modeStore.mode === 'live'" class="settings-row">
          <span class="settings-label">{{ $t('settings.superOverlay') }}</span>
          <div class="settings-actions-row">
            <button class="ghost-btn" :disabled="modeStore.loading" @click="toggleSimulationOverlay">
              {{ modeStore.overlayEnabled ? $t('settings.superOverlayOn') : $t('settings.superOverlayOff') }}
            </button>
          </div>
        </div>
        <p v-if="modeStore.isSuper && modeStore.mode === 'live'" class="status-text mode-hint">
          {{ $t('settings.superOverlayHint') }}
        </p>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.apibinding') }}</span>
          <div class="settings-actions-row">
            <button class="ghost-btn" @click="handleOpenApiBinding">{{ $t('settings.manageApi') }}</button>
          </div>
        </div>
      </section>

      <!-- 交易市场 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('serverSettings.title') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('serverSettings.address') }}</span>
          <span class="settings-value">{{ getApiBaseUrl() }}</span>
        </div>
        <RouterLink class="ghost-btn server-settings-link" to="/server-settings">
          {{ $t('serverSettings.open') }}
        </RouterLink>
      </section>

      <!-- 交易市场 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.exchange') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.currentExchange') }}</span>
          <div class="settings-actions-row">
            <button
              v-for="ex in exchanges"
              :key="ex.value"
              :class="['exch-btn-settings', { active: marketStore.exchange === ex.value }]"
              @click="switchExchange(ex.value)"
            >{{ ex.label }}</button>
          </div>
        </div>
      </section>

      <!-- 账户 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.account') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.user') }}</span>
          <span class="settings-value">{{ authStore.user?.nickname || '--' }}</span>
        </div>
        <!-- 仅 Kaser 账户显示重置入口 -->
        <div v-if="canResetAccount" class="settings-row">
          <span class="settings-label">{{ $t('settings.accountActions') }}</span>
          <div class="settings-actions-row">
            <button class="danger-btn" :disabled="modeStore.mode !== 'simulation'" @click="resetConfirmOpen = true">
              {{ $t('settings.resetAccount') }}
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span></span>
          <button class="danger-btn" @click="handleLogout">{{ $t('settings.logout') }}</button>
        </div>
      </section>

      <!-- 关于 -->
      <section class="settings-card card">
        <h3 class="settings-section-title">{{ $t('settings.about') }}</h3>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.version') }}</span>
          <span class="settings-value">1.0.0</span>
        </div>
      </section>
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

    <ConfirmModal
      :open="resetConfirmOpen"
      :title="$t('assets.resetTitle')"
      :description="$t('assets.resetDesc')"
      :warning-text="$t('assets.resetWarning')"
      confirm-text-key="common.confirm"
      cancel-text-key="common.cancel"
      @cancel="resetConfirmOpen = false"
      @confirm="handleResetSimulation()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { RouterLink } from 'vue-router';
import LocaleSwitcher from '../components/common/LocaleSwitcher.vue';
import CurrencySwitcher from '../components/common/CurrencySwitcher.vue';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAuthStore } from '../stores/auth';
import { useMarketStore } from '../stores/market';
import { useModeStore } from '../stores/mode';
import { authApi } from '../api/services';
import { useThemeStore } from '../stores/theme';
import { useExchangeStore } from '../stores/exchange';
import { useAssetStore } from '../stores/assets';
import { $t } from '../utils/i18n';
import { getApiBaseUrl } from '../config/api';

const authStore = useAuthStore();
const marketStore = useMarketStore();
const modeStore = useModeStore();
const themeStore = useThemeStore();
const exchangeStore = useExchangeStore();
const assetStore = useAssetStore();
const router = useRouter();

const totpSetupSecret = ref('');
const totpSetupUrl = ref('');
const totpSetupCode = ref('');
const totpDisableCode = ref('');
const totpBusy = ref(false);
const securityError = ref('');

async function startTotpSetup() {
  securityError.value = '';
  totpBusy.value = true;
  try {
    const result = await authApi.setupTotp();
    totpSetupSecret.value = result.secret;
    totpSetupUrl.value = result.otpauthUrl;
    totpSetupCode.value = '';
  } catch (error) {
    securityError.value = (error as Error).message || '设置两步验证失败';
  } finally {
    totpBusy.value = false;
  }
}

async function enableTotp() {
  securityError.value = '';
  totpBusy.value = true;
  try {
    await authApi.enableTotp(totpSetupCode.value);
    totpSetupSecret.value = '';
    totpSetupUrl.value = '';
    totpSetupCode.value = '';
    await authStore.fetchMe();
  } catch (error) {
    securityError.value = (error as Error).message || '启用两步验证失败';
  } finally {
    totpBusy.value = false;
  }
}

async function disableTotp() {
  securityError.value = '';
  totpBusy.value = true;
  try {
    await authApi.disableTotp(totpDisableCode.value);
    totpDisableCode.value = '';
    await authStore.fetchMe();
  } catch (error) {
    securityError.value = (error as Error).message || '关闭两步验证失败';
  } finally {
    totpBusy.value = false;
  }
}

const exchanges = [
  { value: 'okx' as const, label: 'OKX' },
  { value: 'binance' as const, label: 'Binance' },
  { value: 'coinbase' as const, label: 'Coinbase' },
  { value: 'uniswap' as const, label: 'Uniswap' },
];

function switchExchange(exch: 'okx' | 'binance' | 'coinbase' | 'uniswap') {
  marketStore.setExchange(exch);
}

const modeConfirmOpen = ref(false);
const resetConfirmOpen = ref(false);

// 只有 Kaser 账户登录时才显示重置入口
const canResetAccount = computed(() => {
  const user = authStore.user;
  const identity = `${user?.nickname || ''} ${user?.email || ''} ${localStorage.getItem('lastLoginEmail') || ''}`;
  return identity.toLowerCase().includes('kaser');
});

const modeConfirmTitle = computed(() => $t('layout.switchConfirmTitle'));
const modeStateLabel = computed(() => {
  if (modeStore.state === 'live_trading') return $t('settings.modeLiveTrading');
  if (modeStore.state === 'live_readonly') return $t('settings.modeLiveReadonly');
  return $t('settings.modeSimulation');
});
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

async function handleEnableLiveTrading() {
  const changed = await modeStore.enableLiveTrading();
  if (changed) {
    await assetStore.fetchAssets(modeStore.mode);
  }
}

async function handleDisableLiveTrading() {
  const changed = await modeStore.disableLiveTrading();
  if (changed) {
    await assetStore.fetchAssets(modeStore.mode);
  }
}

async function toggleSimulationOverlay() {
  const changed = await modeStore.setSimulationOverlay(!modeStore.overlayEnabled);
  if (changed) {
    // 各页面在挂载时按能力矩阵取数，刷新一次避免残留上一模式的数据
    window.location.reload();
  }
}

async function handleResetSimulation() {
  const success = await assetStore.resetSimulation();
  if (success) {
    resetConfirmOpen.value = false;
    await Promise.all([
      assetStore.fetchAssets(modeStore.mode),
      assetStore.fetchLedger(modeStore.mode),
    ]);
  }
}

async function handleLogout() {
  await authStore.logout();
  await router.replace('/login');
}

function handleOpenApiBinding() {
  router.push('/assets');
}
</script>

<style scoped>
.settings-page {
  max-width: 640px;
  margin: 0 auto;
}

.settings-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  padding: 20px;
  border-radius: 12px;
}

.settings-section-title {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.settings-value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}

.settings-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-state-badge {
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.mode-state-badge.live_readonly {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
}

.mode-state-badge.live_trading {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
}

.mode-hint {
  margin: 0 0 8px;
}

.exch-btn-settings {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.exch-btn-settings.active {
  background: rgba(99, 255, 152, 0.14);
  border-color: var(--color-up);
  color: var(--color-up);
}

.exch-btn-settings:hover {
  opacity: 0.85;
}
.security-badge {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.security-badge.verified {
  color: var(--color-up);
  background: rgba(0, 200, 120, 0.12);
}

.security-badge.unverified {
  color: var(--color-down);
  background: rgba(255, 80, 80, 0.12);
}

.totp-setup {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.totp-secret {
  display: block;
  margin: 6px 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 11px;
  word-break: break-all;
}

.settings-input {
  width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 12px;
}

</style>
