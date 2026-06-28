<template>
  <section class="card order-panel">
    <div class="order-head">
      <div>
        <h2 class="section-title">下单面板</h2>
        <div class="status-text">当前交易对：{{ symbol }}</div>
      </div>
      <div class="mode-badge">{{ modeStore.modeLabel }}</div>
    </div>

    <div class="trade-action-toggle">
      <button :class="['toggle-chip', { active: form.action === 'open' }]" @click="form.action = 'open'">开仓</button>
      <button :class="['toggle-chip', { active: form.action === 'close' }]" @click="form.action = 'close'">平仓</button>
      <button class="toggle-chip static-chip" disabled>逐仓</button>
    </div>

    <div class="form-grid">
      <div class="field">
        <label>委托类型</label>
        <select v-model="form.orderType">
          <option value="market">市价单</option>
          <option value="limit">限价单</option>
        </select>
      </div>
      <div class="field">
        <label>杠杆</label>
        <select v-model.number="form.leverage">
          <option :value="1">1x</option>
          <option :value="5">5x</option>
          <option :value="10">10x</option>
          <option :value="20">20x</option>
          <option :value="50">50x</option>
        </select>
      </div>
      <div v-if="form.orderType === 'limit'" class="field">
        <label>价格</label>
        <input v-model="form.price" placeholder="请输入委托价格" />
      </div>
      <div class="field">
        <label>数量</label>
        <input v-model="form.qty" placeholder="请输入下单数量" />
        <div class="qty-presets">
          <button v-for="preset in qtyPresets" :key="preset" class="preset-btn" @click="applyQtyPreset(preset)">
            {{ preset }}%
          </button>
        </div>
      </div>
      <div class="field">
        <label>止盈价</label>
        <input v-model="form.takeProfitPrice" placeholder="可选" />
      </div>
      <div class="field">
        <label>止损价</label>
        <input v-model="form.stopLossPrice" placeholder="可选" />
      </div>
    </div>

    <div class="panel-actions preview-actions">
      <button class="ghost-btn" :disabled="orderStore.submitting" @click="handlePreview()">试算</button>
      <span class="status-text">最大可下：{{ orderStore.preview?.maxQty || estimatedMaxQty }}</span>
    </div>

    <div class="grid-2 preview-grid">
      <div class="card">
        <div class="stat-label">预估保证金</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedMargin || '--' }} USDT</div>
      </div>
      <div class="card">
        <div class="stat-label">预估手续费</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedFee || '--' }} USDT</div>
      </div>
      <div class="card">
        <div class="stat-label">预估名义价值</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedNotional || '--' }} USDT</div>
      </div>
      <div class="card">
        <div class="stat-label">预估强平价</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedLiquidationPrice || '--' }}</div>
      </div>
    </div>

    <div class="order-note">
      <span>风险提示：</span>
      {{ form.action === 'open' ? '开仓前确认杠杆与止损设置。' : '平仓会减少当前持仓，请核对方向与数量。' }}
    </div>

    <div class="panel-actions submit-actions">
      <button class="primary-btn" :disabled="orderStore.submitting" @click="handleSubmit('long')">{{ longActionText }}</button>
      <button class="danger-btn" :disabled="orderStore.submitting" @click="handleSubmit('short')">{{ shortActionText }}</button>
    </div>

    <div v-if="localMessage || orderStore.error" class="status-text">{{ localMessage || orderStore.error }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useModeStore } from '../../stores/mode';
import { useOrderStore } from '../../stores/orders';
import type { OrderPayload, OrderPreviewPayload } from '../../api/types';

const props = defineProps<{
  symbol: string;
  klinePrice?: number | null;
}>();

const emit = defineEmits<{
  submitted: [];
}>();

const modeStore = useModeStore();
const orderStore = useOrderStore();
const qtyPresets = [25, 50, 75, 100];

const form = reactive({
  action: 'open' as 'open' | 'close',
  orderType: 'market' as 'market' | 'limit',
  leverage: 10,
  price: '',
  qty: '0.02',
  takeProfitPrice: '',
  stopLossPrice: '',
});

const localMessage = ref('');
const estimatedMaxQty = computed(() => (Number(form.leverage) * 0.125).toFixed(3));
const longActionText = computed(() => (form.action === 'open' ? '开多' : '平多'));
const shortActionText = computed(() => (form.action === 'open' ? '开空' : '平空'));

watch(
  () => props.symbol,
  () => {
    localMessage.value = '';
  },
);

watch(
  () => props.klinePrice,
  (price) => {
    if (typeof price === 'number' && price > 0) {
      form.price = price.toFixed(2);
      form.orderType = 'limit';
      localMessage.value = `已从K线获取价格 ${form.price}，使用限价单`;
    }
  },
);

function applyQtyPreset(preset: number) {
  const maxQty = Number(orderStore.preview?.maxQty || estimatedMaxQty.value || 0.1);
  form.qty = ((maxQty * preset) / 100).toFixed(3);
}

function buildPreviewPayload(side: 'long' | 'short'): OrderPreviewPayload {
  return {
    mode: modeStore.mode,
    symbol: props.symbol,
    side,
    action: form.action,
    orderType: form.orderType,
    leverage: form.leverage,
    qty: form.qty,
    price: form.orderType === 'limit' ? form.price : null,
    takeProfitPrice: form.takeProfitPrice,
    stopLossPrice: form.stopLossPrice,
  };
}

async function handlePreview() {
  localMessage.value = '';
  await orderStore.previewOrder(buildPreviewPayload('long'));
}

async function handleSubmit(side: 'long' | 'short') {
  localMessage.value = '';

  const previewPayload = buildPreviewPayload(side);
  const payload: OrderPayload = {
    ...previewPayload,
    marginMode: 'isolated',
  };

  const result = await orderStore.submitOrder(payload);

  if (result) {
    localMessage.value = `下单成功，订单号 ${result.orderId}`;
    emit('submitted');
  }
}
</script>

<style scoped>
.order-panel {
  padding: 22px;
}

.order-head,
.trade-action-toggle,
.qty-presets,
.preview-actions,
.submit-actions {
  display: flex;
  gap: 12px;
}

.order-head,
.preview-actions {
  align-items: center;
  justify-content: space-between;
}

.mode-badge,
.toggle-chip,
.preset-btn {
  border-radius: 999px;
  font-weight: 700;
}

.mode-badge {
  padding: 8px 12px;
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
  font-size: 13px;
}

.trade-action-toggle {
  margin-top: 18px;
  flex-wrap: wrap;
}

.toggle-chip,
.preset-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle-chip {
  padding: 10px 16px;
}

.toggle-chip.active {
  border-color: rgba(187, 255, 39, 0.36);
  background: rgba(187, 255, 39, 0.12);
  color: #bbff27;
}

.static-chip {
  cursor: default;
  opacity: 0.7;
}

.qty-presets {
  margin-top: 10px;
  flex-wrap: wrap;
}

.preset-btn {
  padding: 6px 10px;
  font-size: 12px;
}

.order-note {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(245, 166, 35, 0.1);
  color: var(--text-secondary);
  line-height: 1.6;
}

.preview-grid {
  margin-top: 16px;
}

.order-note span {
  color: var(--color-warning);
}
</style>
