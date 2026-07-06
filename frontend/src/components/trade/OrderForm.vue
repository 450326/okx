<template>
  <section class="card order-panel">
    <div class="order-head">
      <h2 class="section-title">{{ $t('order.title') }}</h2>
      <span class="mode-badge">{{ modeStore.modeLabel }}</span>
    </div>

    <div class="trade-action-toggle">
      <button :class="['toggle-chip', { active: form.action === 'open' }]" @click="form.action = 'open'">{{ $t('order.open') }}</button>
      <button :class="['toggle-chip', { active: form.action === 'close' }]" @click="form.action = 'close'">{{ $t('order.close') }}</button>
      <button class="toggle-chip static-chip" disabled>{{ $t('order.isolated') }}</button>
    </div>

    <div class="compact-form">
      <div class="field-row">
        <div class="field">
          <select v-model="form.orderType">
            <option value="market">{{ $t('order.market') }}</option>
            <option value="limit">{{ $t('order.limit') }}</option>
          </select>
        </div>
        <div class="field">
          <select v-model.number="form.leverage">
            <option :value="1">1x</option>
            <option :value="5">5x</option>
            <option :value="10">10x</option>
            <option :value="20">20x</option>
            <option :value="50">50x</option>
          </select>
        </div>
      </div>

      <div v-if="form.orderType === 'limit'" class="field">
        <input v-model="form.price" :placeholder="$t('order.price')" />
      </div>

      <div class="field">
        <div class="qty-input-row">
          <input v-model="form.qty" placeholder="数量" />
          <div class="qty-presets">
            <button v-for="preset in qtyPresets" :key="preset" class="preset-btn" @click="applyQtyPreset(preset)">{{ preset }}%</button>
          </div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <input v-model="form.takeProfitPrice" :placeholder="$t('order.takeProfit')" />
        </div>
        <div class="field">
          <input v-model="form.stopLossPrice" :placeholder="$t('order.stopLoss')" />
        </div>
      </div>
    </div>

    <div class="panel-actions preview-actions">
      <button class="ghost-btn" :disabled="orderStore.submitting" @click="handlePreview()">{{ $t('order.preview') }}</button>
      <span class="status-text">{{ $t('order.maxQty') }}：{{ orderStore.preview?.maxQty || estimatedMaxQty }}</span>
      <button v-if="showPreview" class="ghost-btn" @click="showPreview = false">收起</button>
    </div>

    <div v-if="showPreview" class="preview-grid">
      <div class="preview-item">
        <span class="preview-label">{{ $t('order.estimatedMargin') }}</span>
        <span class="preview-value">{{ orderStore.preview?.estimatedMargin || '--' }}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">{{ $t('order.estimatedFee') }}</span>
        <span class="preview-value">{{ orderStore.preview?.estimatedFee || '--' }}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">{{ $t('order.estimatedNotional') }}</span>
        <span class="preview-value">{{ orderStore.preview?.estimatedNotional || '--' }}</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">{{ $t('order.estimatedLiqPrice') }}</span>
        <span class="preview-value">{{ orderStore.preview?.estimatedLiquidationPrice || '--' }}</span>
      </div>
    </div>

    <div class="panel-actions submit-actions">
      <button class="primary-btn" :disabled="orderStore.submitting" @click="handleSubmit('long')">{{ longActionText }}</button>
      <button class="danger-btn" :disabled="orderStore.submitting" @click="handleSubmit('short')">{{ shortActionText }}</button>
    </div>

    <div v-if="localMessage || orderStore.error" class="status-text order-msg">{{ localMessage || orderStore.error }}</div>
  </section>
</template>

<script setup lang="ts">
// 导入 Vue 响应式工具
import { computed, reactive, ref, watch } from 'vue';
import { $t } from '../../utils/i18n';
// 导入交易模式和订单状态管理
import { useModeStore } from '../../stores/mode';
import { useOrderStore } from '../../stores/orders';
// 导入订单相关类型定义
import type { OrderPayload, OrderPreviewPayload } from '../../api/types';

// 定义 props：当前交易对、K 线价格（用于填充限价单价格）
const props = defineProps<{
  symbol: string;
  klinePrice?: number | null;
}>();

// 定义事件：订单提交成功
const emit = defineEmits<{
  submitted: [];
}>();

// 获取交易模式 store 实例
const modeStore = useModeStore();
// 获取订单 store 实例
const orderStore = useOrderStore();
// 快捷数量百分比预设值
const qtyPresets = [25, 50, 75, 100];

// 下单表单响应式数据
const form = reactive({
  action: 'open' as 'open' | 'close',
  orderType: 'market' as 'market' | 'limit',
  leverage: 10,
  price: '',
  qty: '0.02',
  takeProfitPrice: '',
  stopLossPrice: '',
});

// 本地消息文本
const localMessage = ref('');
// 试算结果展开状态
const showPreview = ref(false);
// 根据杠杆估算最大可下数量
const estimatedMaxQty = computed(() => (Number(form.leverage) * 0.125).toFixed(3));
// 做多按钮文本：开仓/平多
const longActionText = computed(() => form.action === 'open' ? $t('order.openLong') : $t('order.closeLong'));
// 做空按钮文本：开空/平空
const shortActionText = computed(() => form.action === 'open' ? $t('order.openShort') : $t('order.closeShort'));

// 监听交易对变化，清空本地消息
watch(
  () => props.symbol,
  () => {
    localMessage.value = '';
  },
);

// 监听 K 线点击价格，自动填入限价单价格
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

// 按百分比预设快速设置数量
function applyQtyPreset(preset: number) {
  const maxQty = Number(orderStore.preview?.maxQty || estimatedMaxQty.value || 0.1);
  form.qty = ((maxQty * preset) / 100).toFixed(3);
}

// 构建试算/下单请求参数
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

// 执行试算
async function handlePreview() {
  localMessage.value = '';
  showPreview.value = true;
  await orderStore.previewOrder(buildPreviewPayload('long'));
}

// 执行下单提交
async function handleSubmit(side: 'long' | 'short') {
  localMessage.value = '';

  const previewPayload = buildPreviewPayload(side);
  const payload: OrderPayload = {
    ...previewPayload,
    marginMode: 'isolated',
  };

  const result = await orderStore.submitOrder(payload);

  if (result) {
    localMessage.value = `${$t('order.orderSuccess')} ${result.orderId}`;
    emit('submitted');
  }
}
</script>

<style scoped>
.order-panel {
  padding: 12px;
}

.order-head,
.trade-action-toggle,
.panel-actions {
  display: flex;
  gap: 8px;
}

.order-head {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.order-head .section-title {
  margin: 0;
}

.mode-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
  font-size: 11px;
  font-weight: 700;
}

.trade-action-toggle {
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.toggle-chip {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
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

.compact-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.field select,
.field input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-size: 13px;
  box-sizing: border-box;
}

.field select {
  cursor: pointer;
}

.qty-input-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.qty-input-row input {
  flex: 1;
}

.qty-presets {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.preset-btn {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.preview-actions {
  margin-bottom: 8px;
  align-items: center;
  justify-content: space-between;
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 10px;
}

.preview-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-soft);
}

.preview-label {
  color: var(--text-secondary);
  font-size: 11px;
}

.preview-value {
  font-size: 13px;
  font-weight: 700;
}

.submit-actions {
  gap: 8px;
}

.primary-btn,
.danger-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.primary-btn {
  background: #00c087;
  color: #fff;
}

.danger-btn {
  background: #f6465d;
  color: #fff;
}

.primary-btn:disabled,
.danger-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.order-msg {
  margin-top: 8px;
  font-size: 12px;
}
</style>
