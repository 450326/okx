<template>
  <!-- 下单面板卡片 -->
  <section class="card order-panel">
    <!-- 面板头部：标题 + 当前交易对 + 交易模式 -->
    <div class="order-head">
      <div>
        <h2 class="section-title">{{ $t('order.title') }}</h2>
        <div class="status-text">{{ $t('order.currentPair') }}：{{ symbol }}</div>
      </div>
      <!-- 当前交易模式徽章 -->
      <div class="mode-badge">{{ modeStore.modeLabel }}</div>
    </div>

    <!-- 开仓/平仓切换 -->
    <div class="trade-action-toggle">
      <button :class="['toggle-chip', { active: form.action === 'open' }]" @click="form.action = 'open'">{{ $t('order.open') }}</button>
      <button :class="['toggle-chip', { active: form.action === 'close' }]" @click="form.action = 'close'">{{ $t('order.close') }}</button>
      <button class="toggle-chip static-chip" disabled>{{ $t('order.isolated') }}</button>
    </div>

    <!-- 表单字段网格 -->
    <div class="form-grid">
      <!-- 委托类型：市价单 / 限价单 -->
      <div class="field">
        <label>{{ $t('order.orderType') }}</label>
        <select v-model="form.orderType">
          <option value="market">{{ $t('order.market') }}</option>
          <option value="limit">{{ $t('order.limit') }}</option>
        </select>
      </div>
      <!-- 杠杆倍数选择 -->
      <div class="field">
        <label>{{ $t('order.leverage') }}</label>
        <select v-model.number="form.leverage">
          <option :value="1">1x</option>
          <option :value="5">5x</option>
          <option :value="10">10x</option>
          <option :value="20">20x</option>
          <option :value="50">50x</option>
        </select>
      </div>
      <!-- 限价单时的价格输入 -->
      <div v-if="form.orderType === 'limit'" class="field">
        <label>{{ $t('order.price') }}</label>
        <input v-model="form.price" placeholder="请输入委托价格" />
      </div>
      <!-- 数量输入 + 快捷百分比按钮 -->
      <div class="field">
        <label>{{ $t('order.qty') }}</label>
        <input v-model="form.qty" placeholder="请输入下单数量" />
        <div class="qty-presets">
          <button v-for="preset in qtyPresets" :key="preset" class="preset-btn" @click="applyQtyPreset(preset)">
            {{ preset }}%
          </button>
        </div>
      </div>
      <!-- 止盈价输入 -->
      <div class="field">
        <label>{{ $t('order.takeProfit') }}</label>
        <input v-model="form.takeProfitPrice" :placeholder="$t('order.optional')" />
      </div>
      <!-- 止损价输入 -->
      <div class="field">
        <label>{{ $t('order.stopLoss') }}</label>
        <input v-model="form.stopLossPrice" :placeholder="$t('order.optional')" />
      </div>
    </div>

    <!-- 试算操作区：试算按钮 + 最大可下数量 -->
    <div class="panel-actions preview-actions">
      <button class="ghost-btn" :disabled="orderStore.submitting" @click="handlePreview()">{{ $t('order.preview') }}</button>
      <span class="status-text">{{ $t('order.maxQty') }}：{{ orderStore.preview?.maxQty || estimatedMaxQty }}</span>
    </div>

    <!-- 试算结果预览网格 -->
    <div class="grid-2 preview-grid">
      <!-- 预估保证金 -->
      <div class="card">
        <div class="stat-label">{{ $t('order.estimatedMargin') }}</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedMargin || '--' }} USDT</div>
      </div>
      <!-- 预估手续费 -->
      <div class="card">
        <div class="stat-label">{{ $t('order.estimatedFee') }}</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedFee || '--' }} USDT</div>
      </div>
      <!-- 预估名义价值 -->
      <div class="card">
        <div class="stat-label">{{ $t('order.estimatedNotional') }}</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedNotional || '--' }} USDT</div>
      </div>
      <!-- 预估强平价 -->
      <div class="card">
        <div class="stat-label">{{ $t('order.estimatedLiqPrice') }}</div>
        <div class="stat-value">{{ orderStore.preview?.estimatedLiquidationPrice || '--' }}</div>
      </div>
    </div>

    <!-- 风险提示 -->
    <div class="order-note">
      <span>{{ $t('order.riskWarning') }}：</span>
      {{ form.action === 'open' ? $t('order.openRisk') : $t('order.closeRisk') }}
    </div>

    <!-- 提交按钮区：做多 / 做空 -->
    <div class="panel-actions submit-actions">
      <button class="primary-btn" :disabled="orderStore.submitting" @click="handleSubmit('long')">{{ longActionText }}</button>
      <button class="danger-btn" :disabled="orderStore.submitting" @click="handleSubmit('short')">{{ shortActionText }}</button>
    </div>

    <!-- 本地消息或错误状态显示 -->
    <div v-if="localMessage || orderStore.error" class="status-text">{{ localMessage || orderStore.error }}</div>
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
/* 下单面板容器内边距 */
.order-panel {
  padding: 22px;
}

/* 弹性布局：头部、切换、预设、操作区 */
.order-head,
.trade-action-toggle,
.qty-presets,
.preview-actions,
.submit-actions {
  display: flex;
  gap: 12px;
}

/* 头部与试算操作区居中对齐 */
.order-head,
.preview-actions {
  align-items: center;
  justify-content: space-between;
}

/* 徽章、切换按钮、预设按钮统一圆角与字重 */
.mode-badge,
.toggle-chip,
.preset-btn {
  border-radius: 999px;
  font-weight: 700;
}

/* 交易模式徽章样式 */
.mode-badge {
  padding: 8px 12px;
  background: rgba(187, 255, 39, 0.14);
  color: #bbff27;
  font-size: 13px;
}

/* 开平仓切换按钮组上边距与换行 */
.trade-action-toggle {
  margin-top: 18px;
  flex-wrap: wrap;
}

/* 切换按钮与预设按钮基础样式 */
.toggle-chip,
.preset-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-soft);
  color: var(--text-secondary);
  cursor: pointer;
}

/* 切换按钮内边距 */
.toggle-chip {
  padding: 10px 16px;
}

/* 激活态切换按钮 */
.toggle-chip.active {
  border-color: rgba(187, 255, 39, 0.36);
  background: rgba(187, 255, 39, 0.12);
  color: #bbff27;
}

/* 禁用状态切换按钮 */
.static-chip {
  cursor: default;
  opacity: 0.7;
}

/* 快捷百分比按钮组 */
.qty-presets {
  margin-top: 10px;
  flex-wrap: wrap;
}

/* 单个百分比预设按钮 */
.preset-btn {
  padding: 6px 10px;
  font-size: 12px;
}

/* 风险提示区域 */
.order-note {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(245, 166, 35, 0.1);
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 试算结果预览网格上边距 */
.preview-grid {
  margin-top: 16px;
}

/* 风险提示中"风险提示"文本颜色 */
.order-note span {
  color: var(--color-warning);
}
</style>
