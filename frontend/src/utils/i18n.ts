import { useI18nStore } from '../i18n/store';

export function $t(key: string, fallback = ''): string {
  const store = useI18nStore();
  return store.t(key, fallback);
}
