// 导入 Vue 响应式 API
import { computed, ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';

// 交易模式类型：模拟交易/实盘交易
export type TradeMode = 'simulation' | 'live';

// 应用全局状态 store
export const useAppStore = defineStore('app', () => {
  // 当前交易模式
  const mode = ref<TradeMode>('simulation');
  // 当前主题
  const theme = ref<'dark' | 'light'>('dark');
  // 演示用户名
  const userName = ref('Demo User');
  // 账户权益
  const equity = ref('100000.00');
  // 账户可用余额
  const availableBalance = ref('98200.15');
  // 未实现盈亏
  const unrealizedPnl = ref('85.65');

  // 交易模式中文标签
  const modeLabel = computed(() => (mode.value === 'simulation' ? '模拟交易' : '真实交易'));

  // 切换交易模式
  function toggleMode() {
    mode.value = mode.value === 'simulation' ? 'live' : 'simulation';
  }

  // 切换主题
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  // 导出 store 状态与方法
  return {
    mode,
    theme,
    userName,
    equity,
    availableBalance,
    unrealizedPnl,
    modeLabel,
    toggleMode,
    toggleTheme,
  };
});
