import { ref } from 'vue';
import { defineStore } from 'pinia';
import { accountApi } from '../api/services';
import type { AssetSnapshot, LedgerItem, TradeMode } from '../api/types';

export const useAssetStore = defineStore('assets', () => {
  const snapshot = ref<AssetSnapshot | null>(null);
  const ledger = ref<LedgerItem[]>([]);
  const loading = ref(false);
  const ledgerLoading = ref(false);
  const error = ref('');

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
