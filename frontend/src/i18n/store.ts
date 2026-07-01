import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { locales } from './locales';

export type Locale = 'zh' | 'en' | 'ja' | 'ko';

export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>('zh');

  function t(key: string, fallback = ''): string {
    const value = locales[locale.value]?.[key];
    if (value !== undefined) return value;
    const zhValue = locales['zh']?.[key];
    return zhValue !== undefined ? zhValue : fallback || key;
  }

  function setLocale(l: Locale) {
    locale.value = l;
    localStorage.setItem('preferred_locale', l);
  }

  function initLocale() {
    const saved = localStorage.getItem('preferred_locale') as Locale | null;
    if (saved && ['zh', 'en', 'ja', 'ko'].includes(saved)) {
      locale.value = saved;
    }
  }

  return { locale, t, setLocale, initLocale };
});
