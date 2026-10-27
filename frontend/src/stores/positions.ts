// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入持仓 API
import { positionApi } from '../api/services';
// 导入持仓条目及交易模式类型
import type { PositionItem, TradeMode } from '../api/types';

// 持仓状态 store
export const usePositionStore = defineStore('positions', () => {
  // 持仓列表
  const positions = ref<PositionItem[]>([]);
  // 加载状态
  const loading = ref(false);
  // 错误信息
  const error = ref('');
  // 快速切换品种/交易所时丢弃过期响应，避免旧持仓覆盖新数据
  let requestSeq = 0;

  // 获取指定模式的持仓数据，可按交易对筛选
  async function fetchPositions(mode: TradeMode, symbol?: string) {
    const seq = ++requestSeq;
    loading.value = true;
    error.value = '';

    try {
      const data = await positionApi.getPositions(mode, symbol);
      if (seq !== requestSeq) return positions.value;
      positions.value = data.list;
      return positions.value;
    } catch (err) {
      if (seq !== requestSeq) return positions.value;
      error.value = (err as Error).message || '获取持仓失败';
      positions.value = [];
      return [];
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  // 导出 store 状态与方法
  return {
    positions,
    loading,
    error,
    fetchPositions,
  };
});
