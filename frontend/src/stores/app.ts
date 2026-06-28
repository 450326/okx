import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export type TradeMode = 'simulation' | 'live';

export const useAppStore = defineStore('app', () => {
  const mode = ref<TradeMode>('simulation');
  const theme = ref<'dark' | 'light'>('dark');
  const userName = ref('Demo User');
  const equity = ref('100000.00');
  const availableBalance = ref('98200.15');
  const unrealizedPnl = ref('85.65');

  const modeLabel = computed(() => (mode.value === 'simulation' ? '模拟交易' : '真实交易'));

  function toggleMode() {
    mode.value = mode.value === 'simulation' ? 'live' : 'simulation';
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

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
