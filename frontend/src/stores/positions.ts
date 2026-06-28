import { ref } from 'vue';
import { defineStore } from 'pinia';
import { positionApi } from '../api/services';
import type { PositionItem, TradeMode } from '../api/types';

export const usePositionStore = defineStore('positions', () => {
  const positions = ref<PositionItem[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchPositions(mode: TradeMode, symbol?: string) {
    loading.value = true;
    error.value = '';

    try {
      const data = await positionApi.getPositions(mode, symbol);
      positions.value = data.list;
      return positions.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取持仓失败';
      positions.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  return {
    positions,
    loading,
    error,
    fetchPositions,
  };
});
