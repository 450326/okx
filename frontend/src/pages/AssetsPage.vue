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
          <div>
            <div class="stat-label">{{ $t('assets.spotValue') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.spotValue) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('assets.predictionValue') }}</div>
            <div class="stat-value">{{ formatCurrency(assetStore.snapshot?.predictionValue) }}</div>
          </div>
          <div>
            <div class="stat-label">{{ $t('assets.predictionPnl') }}</div>
            <div :class="['stat-value', getTrendClass(assetStore.snapshot?.predictionUnrealizedPnl)]">
              {{ formatSignedCurrency(assetStore.snapshot?.predictionUnrealizedPnl) }}
            </div>
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
          <tr
            v-for="item in assetStore.ledger"
            :key="item.id"
            :class="['ledger-row', { clickable: canOpenLedger(item) }]"
            @click="handleLedgerClick(item)"
          >
            <td>{{ formatLedgerType(item.type) }}</td>
            <td :class="getTrendClass(item.amount)">{{ formatSignedValue(item.amount) }}</td>
            <td>{{ item.balanceAfter }}</td>
            <td>{{ item.symbol || '--' }}</td>
            <td>{{ formatDisplayTime(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!assetStore.ledger.length" class="empty-state">{{ $t('assets.noLedger') }}</div>
    </section>
  </div>

  <ApiBindingModal
    :open="bindingModalOpen"
    :saving="exchangeStore.saving"
    @close="bindingModalOpen = false"
    @submit="handleBindAccount"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { $t } from '../utils/i18n';
import ApiBindingModal from '../components/assets/ApiBindingModal.vue';
import { useAssetStore } from '../stores/assets';
import { useExchangeStore } from '../stores/exchange';
import { useModeStore } from '../stores/mode';
import type { ExchangeAccount, ExchangeAccountPayload, LedgerItem } from '../api/types';
import { formatCurrency, formatLedgerType, formatSignedCurrency, formatSignedValue, getTrendClass } from '../utils/format';
import { exchangeFromSymbol } from '../utils/symbol';

const assetStore = useAssetStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const router = useRouter();
const bindingModalOpen = ref(false);

function formatDisplayTime(value: string) {
  return new Date(value).toLocaleString();
}

// 资金流水可跳转：合约流水跳到对应交易对，预测流水跳到预测市场
const FUTURES_LEDGER_TYPES = new Set(['open_fee', 'close_fee', 'realized_pnl', 'liquidation']);

function canOpenLedger(item: LedgerItem): boolean {
  if (item.type === 'prediction_buy' || item.type === 'prediction_sell') return true;
  if (item.type === 'spot_buy' || item.type === 'spot_sell') return Boolean(item.symbol);
  return FUTURES_LEDGER_TYPES.has(item.type) && Boolean(exchangeFromSymbol(item.symbol));
}

function handleLedgerClick(item: LedgerItem): void {
  if (!canOpenLedger(item)) return;
  if (item.type === 'prediction_buy' || item.type === 'prediction_sell') {
    void router.push('/prediction');
    return;
  }
  if (item.type === 'spot_buy' || item.type === 'spot_sell') {
    void router.push(`/spot/${item.symbol}`);
    return;
  }
  const exchange = exchangeFromSymbol(item.symbol);
  if (!exchange) return;
  void router.push(`/trade/${item.symbol}`);
}

async function loadPageData() {
  await Promise.all([
    assetStore.fetchAssets(modeStore.mode),
    assetStore.fetchLedger(modeStore.mode),
    exchangeStore.fetchAccounts(),
  ]);
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

.ledger-row.clickable {
  cursor: pointer;
  transition: background 0.12s ease;
}

.ledger-row.clickable:hover {
  background: var(--bg-soft);
}
</style>
