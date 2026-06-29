// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入账户 API
import { accountApi } from '../api/services';
// 导入资产快照、流水记录及交易模式类型
import type { AssetSnapshot, LedgerItem, TradeMode } from '../api/types';

// 资产状态 store
export const useAssetStore = defineStore('assets', () => {
  // 资产快照数据
  const snapshot = ref<AssetSnapshot | null>(null);
  // 资金流水列表
  const ledger = ref<LedgerItem[]>([]);
  // 资产加载状态
  const loading = ref(false);
  // 流水加载状态
  const ledgerLoading = ref(false);
  // 错误信息
  const error = ref('');

  // 获取指定模式的资产数据
  async function fetchAssets(mode: TradeMode) {
    loading.value = true;
    error.value = '';

    try {
      snapshot.value = await accountApi.getAssets(mode);
      return snapshot.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取资产失败';
      return null;
    } finally {
      loading.value = false;
    }
  }

  // 获取指定模式的资金流水
  async function fetchLedger(mode: TradeMode) {
    ledgerLoading.value = true;
    error.value = '';

    try {
      const data = await accountApi.getLedger(mode);
      ledger.value = data.list;
      return ledger.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取流水失败';
      return [];
    } finally {
      ledgerLoading.value = false;
    }
  }

  // 重置模拟账户数据
  async function resetSimulation() {
    error.value = '';

    try {
      await accountApi.resetSimulation();
      return true;
    } catch (err) {
      error.value = (err as Error)?.message || '重置模拟账户失败';
      return false;
    }
  }

  // 导出 store 状态与方法
  return {
    snapshot,
    ledger,
    loading,
    ledgerLoading,
    error,
    fetchAssets,
    fetchLedger,
    resetSimulation,
  };
});
