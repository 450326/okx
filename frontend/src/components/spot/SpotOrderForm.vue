<template>
  <section class="card spot-order-card">
    <div class="card-head">
      <h2 class="section-title">{{ $t('spot.trade') }}</h2>
      <span class="sim-badge">{{ $t('spot.simulation') }}</span>
    </div>

    <div class="side-tabs">
      <button
        type="button"
        :class="['side-tab buy', { active: side === 'buy' }]"
        @click="side = 'buy'"
      >
        {{ $t('spot.buy') }}
      </button>
      <button
        type="button"
        :class="['side-tab sell', { active: side === 'sell' }]"
        @click="side = 'sell'"
      >
        {{ $t('spot.sell') }}
      </button>
    </div>

    <div class="spot-meta">
      <span>{{ side === 'buy' ? $t('spot.availableCash') : $t('spot.availableQty') }}</span>
      <strong>
        {{ side === 'buy'
          ? formatCurrency(props.available)
          : `${formatQty(props.holding?.qty || 0)} ${baseCoin}` }}
      </strong>
    </div>

    <label class="form-label">{{ $t('spot.qty') }}</label>
    <div class="input-wrap">
      <input
        v-model="qty"
        type="number"
        min="0"
        step="any"
        :placeholder="$t('spot.qtyPlaceholder')"
      />
      <span class="input-suffix">{{ baseCoin }}</span>
    </div>

    <div class="percent-row">
      <button v-for="percent in [25, 50, 75, 100]" :key="percent" type="button" @click="setPercent(percent)">
        {{ percent }}%
      </button>
    </div>

    <div class="order-summary">
      <div>
        <span>{{ $t('spot.price') }}</span>
        <strong>{{ price > 0 ? formatPrice(price, priceDigits) : '--' }}</strong>
      </div>
      <div>
        <span>{{ $t('spot.estimatedTotal') }}</span>
        <strong>{{ estimated > 0 ? formatCurrency(estimated) : '--' }}</strong>
      </div>
    </div>

    <p v-if="message" :class="['form-message', messageType]">{{ message }}</p>
    <p v-else-if="spotStore.error" class="form-message error">{{ spotStore.error }}</p>

    <button
      type="button"
      :class="['submit-btn', side]"
      :disabled="!canSubmit || spotStore.trading"
      @click="submit"
    >
      {{ spotStore.trading
        ? $t('spot.submitting')
        : side === 'buy'
          ? $t('spot.buy')
          : $t('spot.sell') }}
    </button>

    <p class="fee-hint">{{ $t('spot.marketOnlyHint') }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSpotStore } from '../../stores/spot';
import type { SpotHoldingRecord, TickerItem } from '../../api/types';
import { formatCurrency, formatPrice } from '../../utils/format';
import { $t } from '../../utils/i18n';

const props = defineProps<{
  symbol: string;
  ticker?: TickerItem;
  holding?: SpotHoldingRecord;
  available: number;
  side: 'buy' | 'sell';
  qty: string;
}>();

const emit = defineEmits<{
  'update:side': [value: 'buy' | 'sell'];
  'update:qty': [value: string];
  submitted: [];
}>();

const spotStore = useSpotStore();
const message = ref('');
const messageType = ref<'success' | 'error'>('success');

const side = computed({
  get: () => props.side,
  set: (value: 'buy' | 'sell') => emit('update:side', value),
});

const qty = computed({
  get: () => props.qty,
  set: (value: string) => emit('update:qty', value),
});

const baseCoin = computed(() => {
  const symbol = props.symbol || '';
  return symbol.includes('-') ? symbol.split('-')[0] : symbol.replace(/(USDT|USDC|USD)$/, '');
});

const price = computed(() => {
  const ticker = props.ticker;
  if (!ticker) return 0;
  const fallback = Number(ticker.lastPrice) || Number(ticker.markPrice) || 0;
  const quoted = side.value === 'buy' ? Number(ticker.askPrice) : Number(ticker.bidPrice);
  return quoted > 0 ? quoted : fallback;
});

const priceDigits = computed(() => {
  const value = price.value;
  return value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
});

const estimated = computed(() => (Number(qty.value) || 0) * price.value);

const maxQty = computed(() => {
  if (price.value <= 0) return 0;
  if (side.value === 'sell') return Number(props.holding?.qty || 0);
  // 预留 0.05% taker 手续费
  return props.available / (price.value * 1.0005);
});

const canSubmit = computed(() => {
  const amount = Number(qty.value);
  if (!props.symbol || amount <= 0 || price.value <= 0) return false;
  if (side.value === 'sell') return amount <= Number(props.holding?.qty || 0) + 0.00000001;
  return estimated.value <= props.available + 0.000001;
});

function formatQty(value: string | number): string {
  return (Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function setPercent(percent: number) {
  const value = (maxQty.value * percent) / 100;
  if (!Number.isFinite(value) || value <= 0) return;
  qty.value = value.toFixed(8).replace(/\.?0+$/, '');
}

async function submit() {
  message.value = '';
  const amount = Number(qty.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    message.value = $t('spot.invalidQty');
    messageType.value = 'error';
    return;
  }

  const result = await spotStore.placeOrder({
    symbol: props.symbol,
    side: side.value,
    qty: String(amount),
  });

  if (!result) {
    message.value = spotStore.error || $t('spot.orderFailed');
    messageType.value = 'error';
    return;
  }

  message.value = $t('spot.orderSuccess');
  messageType.value = 'success';
  qty.value = '';
  emit('submitted');
}

watch(() => props.symbol, () => {
  message.value = '';
  qty.value = '';
});
</script>

<style scoped>
.spot-order-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sim-badge {
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(187, 255, 39, 0.12);
  color: #bbff27;
  font-size: 10px;
  font-weight: 700;
}

.side-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  border-radius: 10px;
  background: var(--bg-soft);
}

.side-tab {
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.side-tab.buy.active {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.side-tab.sell.active {
  background: rgba(239, 68, 68, 0.16);
  color: #f87171;
}

.spot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}

.spot-meta strong {
  color: var(--text-primary);
  font-size: 12px;
}

.form-label {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 11px;
}

.input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-soft);
}

.input-wrap input {
  flex: 1;
  min-width: 0;
  padding: 11px 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.input-suffix {
  color: var(--text-secondary);
  font-size: 11px;
}

.percent-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}

.percent-row button {
  padding: 6px 0;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.percent-row button:hover {
  color: var(--text-primary);
  border-color: rgba(187, 255, 39, 0.4);
}

.order-summary {
  display: grid;
  gap: 7px;
  padding: 10px;
  border-radius: 9px;
  background: var(--bg-soft);
}

.order-summary > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}

.order-summary strong {
  color: var(--text-primary);
  font-size: 12px;
}

.form-message {
  margin: 0;
  font-size: 11px;
}

.form-message.success {
  color: #4ade80;
}

.form-message.error {
  color: #f87171;
}

.submit-btn {
  padding: 12px;
  border: 0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.submit-btn.buy {
  background: #22c55e;
  color: #04130a;
}

.submit-btn.sell {
  background: #ef4444;
  color: #fff;
}

.submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fee-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.5;
}
</style>
