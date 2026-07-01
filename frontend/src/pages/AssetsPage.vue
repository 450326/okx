<template>
  <div class="page">
    <h1 class="page-title">{{ $t('assets.pageTitle') }}</h1>

    <section class="grid-2">
      <div class="card">
        <h2 class="section-title">{{ $t('assets.overview') }}</h2>
        <div class="grid-2">
          <div>
            <div class="stat-label">{{ $t('assets.walletBalance') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.walletBalance) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('layout.availableBalance') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.availableBalance) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('assets.positionMargin') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.positionMargin) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('assets.orderMargin') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.orderMargin) }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="section-title">{{ $t('assets.modeTools') }}</h2>
        <div class="panel-actions">
          <button class="ghost-btn" :disabled="exchangeStore.saving" @click="handleTestConnection()">
            {{ $t('assets.testApi') }}
          </button>
          <button class="ghost-btn" @click="bindingModalOpen = true">{{ $t('assets.bindAccount') }}</button>
          <button class="danger-btn" :disabled="modeStore.mode !== 'simulation'" @click="resetConfirmOpen = true">
            {{ $t('assets.resetSimulation') }}
          </button>
        </div>
        <div class="status-text">
          {{ modeStore.mode === 'simulation' ? $t('assets.canReset') : $t('assets.cannotReset') }}
        </div>
        <div v-if="exchangeStore.statusMessage || exchangeStore.error" class="status-text">
          {{ exchangeStore.statusMessage || exchangeStore.error }}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <h2 class="section-title">{{ $t('assets.apiBinding') }}</h2>
        <span class="status-text">{{ exchangeStore.loading ? $t('common.loading') : $t('assets.boundAccounts') }}</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('assets.exchange') }}</th>
            <th>{{ $t('assets.accountLabel') }}</th>
            <th>{{ $t('assets.status') }}</th>
            <th>{{ $t('assets.testnet') }}</th>
            <th>{{ $t('assets.lastTest') }}</th>
            <th>{{ $t('assets.lastSync') }}</th>
            <th>{{ $t('assets.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in exchangeStore.accounts" :key="item.id">
            <td>{{ item.exchange.toUpperCase() }}</td>
            <td>{{ item.label }}</td>
            <td>{{ item.status }}</td>
            <td>{{ item.isTestnet ? $t('assets.yes') : $t('assets.no') }}</td>
            <td>{{ item.lastTestAt ? formatDisplayTime(item.lastTestAt) : '--' }}</td>
            <td>{{ item.lastSyncAt ? formatDisplayTime(item.lastSyncAt) : '--' }}</td>
            <td>
              <button
                class="danger-btn-sm"
                :disabled="exchangeStore.saving"
                @click="handleDeleteAccount(item)"
              >
                {{ $t('assets.delete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!exchangeStore.accounts.length" class="empty-state">{{ $t('assets.noApiAccounts') }}</div>
    </section>

    <section class="card">
      <h2 class="section-title">{{ $t('assets.ledger') }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('assets.type') }}</th>
            <th>{{ $t('assets.amount') }}</th>
            <th>{{ $t('assets.balance') }}</th>
            <th>{{ $t('assets.symbol') }}</th>
            <th>{{ $t('assets.time') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in assetStore.ledger" :key="item.id">
            <td>{{ item.type }}</td>
            <td :class="getTrendClass(item.amount)">{{ formatSignedValue(item.amount) }}</td>
            <td>{{ item.balanceAfter }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ formatDisplayTime(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!assetStore.ledger.length" class="empty-state">{{ $t('assets.noLedger') }}</div>
    </section>
  </div>

  <ConfirmModal
    :open="resetConfirmOpen"
    :title="$t('assets.resetTitle')"
    :description="$t('assets.resetDesc')"
    :warning-text="$t('assets.resetWarning')"
    confirm-text="$t('common.confirm')"
    cancel-text="$t('common.cancel')"
    @cancel="resetConfirmOpen = false"
    @confirm="handleResetSimulation()"
  />

  <ApiBindingModal
    :open="bindingModalOpen"
    :saving="exchangeStore.saving"
    @close="bindingModalOpen = false"
    @submit="handleBindAccount"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { $t } from '../utils/i18n';
import ApiBindingModal from '../components/assets/ApiBindingModal.vue';
import ConfirmModal from '../components/common/ConfirmModal.vue';
import { useAssetStore } from '../stores/assets';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import type { ExchangeAccount, ExchangeAccountPayload } from '../api/types';
import { formatCurrency, formatSignedValue, getTrendClass } from '../utils/format';

const assetStore = useAssetStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const bindingModalOpen = ref(false);
const resetConfirmOpen = ref(false);

function formatDisplayTime(value: string) {
  return new Date(value).toLocaleString();
}

async function loadPageData() {
  await Promise.all([
    assetStore.fetchAssets(modeStore.mode),
    assetStore.fetchLedger(modeStore.mode),
    exchangeStore.fetchAccounts(),
  ]);
}

async function handleResetSimulation() {
  const success = await assetStore.resetSimulation();

  if (success) {
    resetConfirmOpen.value = false;
    await loadPageData();
  }
}

async function handleTestConnection() {
  await exchangeStore.testFirstAccount();
}

async function handleBindAccount(payload: ExchangeAccountPayload) {
  const result = await exchangeStore.createAccount(payload);

  if (result) {
    bindingModalOpen.value = false;
    await exchangeStore.fetchAccounts();
  }
}

async function handleDeleteAccount(account: ExchangeAccount) {
  if (!confirm(`确定要删除 API 账户「${account.label}」吗？`)) return;
  await exchangeStore.deleteAccount(account.id);
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
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.danger-btn-sm {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  background: var(--color-down);
  color: #fff;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.danger-btn-sm:hover {
  opacity: 0.85;
}

.danger-btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
