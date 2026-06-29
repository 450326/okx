import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { accountApi } from '../api/services';
import type { TradeMode } from '../api/types';

export const useModeStore = defineStore('mode', () => {
  const mode = ref<TradeMode>('simulation');
  const loading = ref(false);
  const error = ref('');

  const modeLabel = computed(() => (mode.value === 'simulation' ? '模拟交易' : '真实交易'));

  async function fetchMode() {
    loading.value = true;
    error.value = '';

    try {
      const data = await accountApi.getMode();
      mode.value = data.mode;
      return mode.value;
    } catch (err) {
      error.value = (err as Error)?.message ?? '获取模式失败';
      return mode.value;
    } finally {
      loading.value = false;
    }
  }

  async function updateMode(nextMode: TradeMode) {
    loading.value = true;
    error.value = '';

    try {
      const data = await accountApi.updateMode(nextMode);
      mode.value = data.mode;
      return true;
    } catch (err) {
      error.value = (err as Error)?.message ?? '切换模式失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function toggleMode() {
    const nextMode = mode.value === 'simulation' ? 'live' : 'simulation';
    return updateMode(nextMode);
  }

  return {
    mode,
    loading,
    error,
    modeLabel,
    fetchMode,
    updateMode,
    toggleMode,
  };
});
