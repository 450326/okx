<template>
  <div v-if="open" class="order-confirm-mask" @click.self="emit('cancel')">
    <div class="order-confirm card">
      <div class="confirm-head">
        <div>
          <h3 class="section-title">{{ $t('orderConfirm.title') }}</h3>
          <p class="confirm-subtitle">{{ $t('orderConfirm.subtitle') }}</p>
        </div>
        <span :class="['risk-badge', `risk-${riskLevel}`]">
          {{ $t(`risk.${riskLevel}`) }}
        </span>
      </div>

      <div v-if="live" class="real-money-banner">
        {{ $t('orderConfirm.realMoneyWarning') }}
      </div>

      <div class="risk-alerts">
        <div
          v-for="(warning, index) in warnings"
          :key="`${warning.level}-${index}`"
          :class="['risk-alert', `risk-alert-${warning.level}`]"
        >
          {{ warning.text }}
        </div>
      </div>

      <div class="confirm-grid">
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.direction') }}</span>
          <strong :class="side === 'long' ? 'up' : 'down'">
            {{ side === 'long' ? $t('positions.long') : $t('positions.short') }}
          </strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.symbol') }}</span>
          <strong>{{ payload?.symbol || '--' }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.type') }}</span>
          <strong>{{ payload?.orderType === 'limit' ? $t('order.limit') : $t('order.market') }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.qty') }}</span>
          <strong>{{ formatValue(payload?.qty) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.leverage') }}</span>
          <strong>{{ payload?.leverage }}x</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.notional') }}</span>
          <strong>{{ formatMoney(preview?.estimatedNotional) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.margin') }}</span>
          <strong>{{ formatMoney(preview?.estimatedMargin) }}</strong>
        </div>
        <div class="confirm-item">
          <span>Maker / Taker</span>
          <strong>{{ formatMoney(makerFee) }} / {{ formatMoney(takerFee) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.liqPrice') }}</span>
          <strong>{{ formatMoney(preview?.estimatedLiquidationPrice) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.liqDistance') }}</span>
          <strong :class="`risk-${riskLevel}`">{{ formatDistance(distance) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.maxQty') }}</span>
          <strong>{{ formatValue(preview?.maxQty) }}</strong>
        </div>
        <div class="confirm-item">
          <span>{{ $t('orderConfirm.maxLoss') }}</span>
          <strong>{{ formatMoney(preview?.estimatedMargin) }}</strong>
        </div>
      </div>

      <div class="confirm-foot">
        <button class="ghost-btn" type="button" :disabled="loading" @click="emit('cancel')">
          {{ $t('orderConfirm.cancel') }}
        </button>
        <button
          :class="live ? 'danger-btn' : 'primary-btn'"
          type="button"
          :disabled="loading"
          @click="emit('confirm')"
        >
          {{ loading ? $t('common.processing') : live ? $t('orderConfirm.confirmLive') : $t('orderConfirm.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OrderPayload, OrderPreviewResult } from '../../api/types';
import type { RiskLevel } from '../../utils/risk';
import { estimateMakerFee, estimateTakerFee } from '../../utils/risk';
import { $t } from '../../utils/i18n';

const props = defineProps<{
  open: boolean;
  payload: OrderPayload | null;
  preview: OrderPreviewResult | null;
  riskLevel: RiskLevel;
  distance: number | null;
  live: boolean;
  warnings: Array<{ level: RiskLevel; text: string }>;
  loading?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const side = computed<'long' | 'short'>(() => (props.payload?.side === 'short' ? 'short' : 'long'));
const makerFee = computed(() => estimateMakerFee(props.preview));
const takerFee = computed(() => estimateTakerFee(props.preview));

function formatMoney(value: string | number | null | undefined): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return number.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '--';
  return String(value);
}

function formatDistance(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(2)}%`;
}
</script>

<style scoped>
.order-confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(4, 8, 14, 0.78);
  backdrop-filter: blur(4px);
}

.order-confirm {
  width: min(100%, 620px);
  max-height: 90vh;
  overflow-y: auto;
  padding: 18px;
}

.confirm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.confirm-head .section-title {
  margin: 0 0 4px;
}

.confirm-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.risk-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.real-money-banner,
.risk-alert {
  margin-bottom: 8px;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.real-money-banner {
  border: 1px solid rgba(255, 90, 90, 0.4);
  background: rgba(255, 70, 70, 0.12);
  color: #ff8b8b;
  font-weight: 700;
}

.risk-alert-warning {
  background: rgba(245, 166, 35, 0.1);
  color: var(--color-warning);
}

.risk-alert-danger {
  background: rgba(255, 70, 70, 0.12);
  color: #ff7d7d;
}

.risk-alert-watch {
  background: rgba(64, 158, 255, 0.1);
  color: #7db8ff;
}

.risk-alert-safe {
  background: rgba(0, 200, 120, 0.1);
  color: var(--color-up);
}

.risk-alert-unknown {
  background: var(--bg-soft);
  color: var(--text-secondary);
}

.confirm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 12px 0;
  background: var(--border-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}

.confirm-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
  background: var(--bg-soft);
  font-size: 12px;
}

.confirm-item span {
  color: var(--text-secondary);
}

.confirm-item strong {
  color: var(--text-primary);
  text-align: right;
}

.confirm-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.risk-safe {
  color: var(--color-up);
}

.risk-watch {
  color: #7db8ff;
}

.risk-warning {
  color: var(--color-warning);
}

.risk-danger {
  color: #ff6b6b;
}

.risk-unknown {
  color: var(--text-secondary);
}

@media (max-width: 520px) {
  .confirm-grid {
    grid-template-columns: 1fr;
  }
}
</style>
