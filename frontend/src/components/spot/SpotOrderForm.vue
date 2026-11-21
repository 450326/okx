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
import { fromUnits, MONEY_UNIT, mulUnits, toUnits } from '../../utils/money';
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

// 与后端一致：taker 手续费 5bps；市价买入按 ask 上浮 2bps 滑点成交
const TAKER_FEE_BPS = 5n;
const SLIPPAGE_BPS = 2n;
const MAX_QTY_SAFETY_BPS = 50n;

const priceUnits = computed(() => toUnits(price.value));
const qtyUnits = computed(() => toUnits(qty.value));
const availableUnits = computed(() => toUnits(props.available));
const holdingUnits = computed(() => toUnits(props.holding?.qty ?? 0));

// 预计金额按盘口价展示；能不能下单按「含滑点的成交价 + 手续费」判断，和后端扣款一致
const estimated = computed(() => fromUnits(mulUnits(qtyUnits.value, priceUnits.value)));
const slippedPriceUnits = computed(() => (priceUnits.value * (10000n + SLIPPAGE_BPS)) / 10000n);
const payableUnits = computed(() => {
  const notional = mulUnits(qtyUnits.value, slippedPriceUnits.value);
  return notional + (notional * TAKER_FEE_BPS) / 10000n;
});

const maxQty = computed(() => {
  if (side.value === 'sell') return fromUnits(holdingUnits.value);
  if (slippedPriceUnits.value <= 0n) return 0;
  // 「100%」留 0.5% 价格波动缓冲：市价单按提交瞬间的盘口成交，
  // 从渲染到点击之间盘口一旦上移，按数学最大值下单必然被后端以余额不足拒绝。
  const budgetUnits =
    (availableUnits.value * (10000n - MAX_QTY_SAFETY_BPS)) / (10000n + TAKER_FEE_BPS);
  return fromUnits((budgetUnits * MONEY_UNIT) / slippedPriceUnits.value);
});

const canSubmit = computed(() => {
  if (!props.symbol || qtyUnits.value <= 0n || priceUnits.value <= 0n) return false;
  if (side.value === 'sell') return qtyUnits.value <= holdingUnits.value;
  return payableUnits.value <= availableUnits.value;
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
  // 用最小单位判断数量和提交，避免 "0.1 + 0.2" 这类浮点值传到后端
  const amountUnits = qtyUnits.value;
  if (amountUnits <= 0n) {
    message.value = $t('spot.invalidQty');
    messageType.value = 'error';
    return;
  }

  const result = await spotStore.placeOrder({
    symbol: props.symbol,
    side: side.value,
    qty: fromUnits(amountUnits).toFixed(8).replace(/\.?0+$/, ''),
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
