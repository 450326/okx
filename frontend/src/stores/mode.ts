// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入账户 API
import { accountApi } from '../api/services';
// 导入交易模式类型
import type { TradeMode } from '../api/types';

// 交易模式状态 store
export const useModeStore = defineStore('mode', () => {
  // 当前交易模式
  const mode = ref<TradeMode>('simulation');
  // 加载状态
  const loading = ref(false);
  // 错误信息
  const error = ref('');

  // 从服务端获取当前交易模式
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

  // 更新交易模式
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

  // 切换交易模式（模拟/实盘互切）
  async function toggleMode() {
    const nextMode = mode.value === 'simulation' ? 'live' : 'simulation';
    return updateMode(nextMode);
  }

  // 导出 store 状态与方法
  return {
    mode,
    loading,
    error,
    fetchMode,
    updateMode,
    toggleMode,
  };
});
