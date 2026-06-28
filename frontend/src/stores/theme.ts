import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Theme } from '../api/types';

const THEME_STORAGE_KEY = 'okx-futures-theme';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('dark');

  function applyTheme(nextTheme: Theme) {
    theme.value = nextTheme;
    // Theme tokens are driven by the root dataset so all pages follow one switch.
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  function initializeTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    applyTheme(savedTheme || 'dark');
  }

  function toggleTheme() {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  return {
    theme,
    applyTheme,
    initializeTheme,
    toggleTheme,
  };
});
