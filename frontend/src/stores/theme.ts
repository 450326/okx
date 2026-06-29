// 导入 Vue 响应式 API
import { ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入主题类型
import type { Theme } from '../api/types';

// 本地存储主题的 key
const THEME_STORAGE_KEY = 'okx-futures-theme';

// 主题状态 store
export const useThemeStore = defineStore('theme', () => {
  // 当前主题，默认为深色
  const theme = ref<Theme>('dark');

  // 应用主题：更新状态、DOM 属性及本地存储
  function applyTheme(nextTheme: Theme) {
    theme.value = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  // 初始化主题：从本地存储读取并应用
  function initializeTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    applyTheme(savedTheme || 'dark');
  }

  // 切换主题（深色/浅色）
  function toggleTheme() {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  // 导出 store 状态与方法
  return {
    theme,
    applyTheme,
    initializeTheme,
    toggleTheme,
  };
});
