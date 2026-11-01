// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入账户 API
import { accountApi } from '../api/services';
// 导入交易模式类型
import type {
  AccountModeResponse,
  CapabilityKey,
  CapabilityState,
  ModeCapabilities,
  TradeMode,
  TradingState,
} from '../api/types';

const EMPTY_CAPABILITIES: ModeCapabilities = {
  canUseSimulation: true,
  canReadLive: false,
  canTradeLive: false,
  canEnterLiveReadonly: false,
  canEnterLiveTrading: false,
};

const EMPTY_MATRIX: Record<CapabilityKey, CapabilityState> = {
  marketData: { allowed: true, source: 'public' },
  futuresPositions: { allowed: false, source: 'none' },
  futuresOpenOrders: { allowed: false, source: 'none' },
  futuresOrderHistory: { allowed: false, source: 'none' },
  futuresTrade: { allowed: false, source: 'none' },
  spotHoldings: { allowed: false, source: 'none' },
  spotTrade: { allowed: false, source: 'none' },
  predictionPositions: { allowed: false, source: 'none' },
  predictionTrade: { allowed: false, source: 'none' },
  ledger: { allowed: false, source: 'none' },
  equityHistory: { allowed: false, source: 'none' },
  simulationReset: { allowed: false, source: 'none' },
};

// 交易模式状态 store
export const useModeStore = defineStore('mode', () => {
  // 兼容现有页面的有效模式
  const mode = ref<TradeMode>('simulation');
  // 服务端真实状态机
  const state = ref<TradingState>('simulation');
  const capabilities = ref<ModeCapabilities>({ ...EMPTY_CAPABILITIES });
  const matrix = ref<Record<CapabilityKey, CapabilityState>>({ ...EMPTY_MATRIX });
  const isSuper = ref(false);
  const overlayEnabled = ref(false);
  const blockers = ref<string[]>([]);
  const updatedAt = ref('');
  // 加载状态
  const loading = ref(false);
  // 错误信息
  const error = ref('');

  function apply(data: AccountModeResponse) {
    mode.value = data.mode === 'live' ? 'live' : 'simulation';
    state.value = data.state || (data.mode === 'live' ? 'live_readonly' : 'simulation');
    capabilities.value = { ...EMPTY_CAPABILITIES, ...(data.capabilities || {}) };
    matrix.value = { ...EMPTY_MATRIX, ...(data.matrix || {}) };
    isSuper.value = Boolean(data.isSuper);
    overlayEnabled.value = Boolean(data.overlayEnabled);
    blockers.value = data.blockers || [];
    updatedAt.value = data.updatedAt || '';
  }

  function can(key: CapabilityKey): boolean {
    return Boolean(matrix.value[key]?.allowed);
  }

  function reasonOf(key: CapabilityKey): string {
    return matrix.value[key]?.reason || '';
  }

  function sourceOf(key: CapabilityKey): CapabilityState['source'] {
    return matrix.value[key]?.source || 'none';
  }

  async function setSimulationOverlay(enabled: boolean) {
    if (!isSuper.value) return false;
    if (enabled) {
      localStorage.setItem('simulationOverlay', '1');
    } else {
      localStorage.removeItem('simulationOverlay');
    }
    await fetchMode();
    return true;
  }

  // 从服务端获取当前交易模式
  async function fetchMode() {
    loading.value = true;
    error.value = '';

    try {
      const data = await accountApi.getMode();
      apply(data);
      return state.value;
    } catch (err) {
      error.value = (err as Error)?.message ?? '获取模式失败';
      return state.value;
    } finally {
      loading.value = false;
    }
  }

  // 更新交易模式（simulation / live / live_readonly / live_trading）
  async function updateMode(nextMode: TradeMode | TradingState, reason?: string) {
    loading.value = true;
    error.value = '';

    try {
      const data = await accountApi.updateMode(nextMode, reason);
      apply(data);
      return true;
    } catch (err) {
      error.value = (err as Error)?.message ?? '切换模式失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  // 切换模拟/实盘：进入 live 时只到“实盘只读”，交易需再显式开启
  async function toggleMode() {
    const nextMode: TradeMode = mode.value === 'simulation' ? 'live' : 'simulation';
    return updateMode(nextMode);
  }

  // 实盘只读 → 实盘交易（服务端会做 API 权限/余额前置校验）
  async function enableLiveTrading() {
    return updateMode('live_trading', 'enable_live_trading');
  }

  // 实盘交易 → 实盘只读（降级，不退出实盘）
  async function disableLiveTrading() {
    return updateMode('live_readonly', 'disable_live_trading');
  }

  // 导出 store 状态与方法
  return {
    mode,
    state,
    capabilities,
    matrix,
    isSuper,
    overlayEnabled,
    blockers,
    updatedAt,
    loading,
    error,
    can,
    reasonOf,
    sourceOf,
    setSimulationOverlay,
    fetchMode,
    updateMode,
    toggleMode,
    enableLiveTrading,
    disableLiveTrading,
  };
});
