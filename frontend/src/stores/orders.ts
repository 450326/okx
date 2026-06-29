import { ref } from 'vue';
import { defineStore } from 'pinia';
import { orderApi } from '../api/services';
import type {
  OrderItem,
  OrderPayload,
  OrderPreviewPayload,
  OrderPreviewResult,
  TradeMode,
} from '../api/types';

export const useOrderStore = defineStore('orders', () => {
  const preview = ref<OrderPreviewResult | null>(null);
  const openOrders = ref<OrderItem[]>([]);
  const historyOrders = ref<OrderItem[]>([]);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref('');

  async function fetchOpenOrders(mode: TradeMode, symbol?: string) {
    loading.value = true;
    error.value = '';

    try {
      const data = await orderApi.getOpen(mode, symbol);
      openOrders.value = data.list;
      return openOrders.value;
    } catch (err) {
      const msg = (err as any)?.message;
      error.value = msg || '获取当前委托失败';
      openOrders.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchHistory(mode: TradeMode, symbol?: string) {
    loading.value = true;
    error.value = '';

    try {
      const data = await orderApi.getHistory(mode, symbol);
      historyOrders.value = data.list;
      return historyOrders.value;
    } catch (err) {
      const msg = (err as any)?.message;
      error.value = msg || '获取历史订单失败';
      historyOrders.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

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
  };
});
