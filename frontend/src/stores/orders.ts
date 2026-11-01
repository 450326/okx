// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入订单 API
import { orderApi } from '../api/services';
// 导入订单相关类型
import type {
  OrderItem,
  OrderPayload,
  OrderPreviewPayload,
  OrderPreviewResult,
  TradeMode,
} from '../api/types';

// 订单状态 store
export const useOrderStore = defineStore('orders', () => {
  // 订单试算结果
  const preview = ref<OrderPreviewResult | null>(null);
  // 当前委托列表
  const openOrders = ref<OrderItem[]>([]);
  // 历史订单列表
  const historyOrders = ref<OrderItem[]>([]);
  // 加载状态
  const loading = ref(false);
  // 提交中状态
  const submitting = ref(false);
  // 错误信息
  const error = ref('');
  // 快速切换品种/交易所时丢弃过期响应
  let openRequestSeq = 0;
  let historyRequestSeq = 0;

  // 获取当前委托，可按交易对筛选
  async function fetchOpenOrders(mode: TradeMode, symbol?: string) {
    const seq = ++openRequestSeq;
    loading.value = true;
    error.value = '';

    try {
      const data = await orderApi.getOpen(mode, symbol);
      if (seq !== openRequestSeq) return openOrders.value;
      openOrders.value = data.list;
      return openOrders.value;
    } catch (err) {
      if (seq !== openRequestSeq) return openOrders.value;
      const msg = (err as any)?.message;
      error.value = msg || '获取当前委托失败';
      openOrders.value = [];
      return [];
    } finally {
      if (seq === openRequestSeq) loading.value = false;
    }
  }

  // 获取历史订单，可按交易对筛选
  async function fetchHistory(mode: TradeMode, symbol?: string) {
    const seq = ++historyRequestSeq;
    loading.value = true;
    error.value = '';

    try {
      const data = await orderApi.getHistory(mode, symbol);
      if (seq !== historyRequestSeq) return historyOrders.value;
      historyOrders.value = data.list;
      return historyOrders.value;
    } catch (err) {
      if (seq !== historyRequestSeq) return historyOrders.value;
      const msg = (err as any)?.message;
      error.value = msg || '获取历史订单失败';
      historyOrders.value = [];
      return [];
    } finally {
      if (seq === historyRequestSeq) loading.value = false;
    }
  }

  // 试算订单（预览保证金/手续费等）
  async function previewOrder(payload: OrderPreviewPayload) {
    submitting.value = true;
    error.value = '';

    try {
      preview.value = await orderApi.preview(payload);
      return preview.value;
    } catch (err) {
      const msg = (err as any)?.message;
      error.value = msg || '试算失败';
      return null;
    } finally {
      submitting.value = false;
    }
  }

  // 清空试算结果（切换开平方向/品种时避免展示旧数据）
  function clearPreview() {
    preview.value = null;
    error.value = '';
  }

  // 撤销未成交委托
  async function cancelOrder(orderId: string, mode: TradeMode, symbol?: string) {
    error.value = '';
    try {
      await orderApi.cancel(orderId, mode, symbol);
      openOrders.value = openOrders.value.filter((item) => item.orderId !== orderId);
      return true;
    } catch (err) {
      error.value = (err as any)?.message || '撤单失败';
      return false;
    }
  }

  // 提交订单
  async function submitOrder(payload: OrderPayload) {
    submitting.value = true;
    error.value = '';

    try {
      const result = await orderApi.create(payload);
      return result;
    } catch (err) {
      const msg = (err as any)?.message;
      error.value = msg || '下单失败';
      return null;
    } finally {
      submitting.value = false;
    }
  }

  // 导出 store 状态与方法
  return {
    preview,
    openOrders,
    historyOrders,
    loading,
    submitting,
    error,
    fetchOpenOrders,
    fetchHistory,
    previewOrder,
    submitOrder,
    cancelOrder,
    clearPreview,
  };
});
