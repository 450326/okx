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
            <div :class="['tag', { 'tag-live': modeStore.mode === 'live' }]">
              {{ modeStore.mode === 'simulation' ? $t('equity.simulation') : $t('equity.live') }}
            </div>
            <button class="ghost-btn" :disabled="modeStore.loading" @click="openModeConfirm()">
              {{ $t('layout.switchTo') }}{{ modeStore.mode === 'simulation' ? $t('equity.live') : $t('equity.simulation') }}
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">{{ $t('settings.apibinding') }}</span>
          <div class="settings-actions-row">
            <button class="ghost-btn" @click="handleOpenApiBinding">{{ $t('settings.manageApi') }}</button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import LocaleSwitcher from '../components/common/LocaleSwitcher.vue';
import CurrencySwitcher from '../components/common/CurrencySwitcher.vue';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAuthStore } from '../stores/auth';
import { useModeStore } from '../stores/mode';
import { useThemeStore } from '../stores/theme';
import { useExchangeStore } from '../stores/exchange';
import { useAssetStore } from '../stores/assets';
import { $t } from '../utils/i18n';

const authStore = useAuthStore();
const modeStore = useModeStore();
const themeStore = useThemeStore();
const exchangeStore = useExchangeStore();
const assetStore = useAssetStore();
const router = useRouter();
const modeConfirmOpen = ref(false);

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

function handleLogout() {
  authStore.logout();
  router.replace('/login');
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

.tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 192, 135, 0.15);
  color: #00c087;
  text-transform: uppercase;
}

.tag-live {
  background: rgba(246, 70, 93, 0.15);
  color: #f6465d;
}
</style>
