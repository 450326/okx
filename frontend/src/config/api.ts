const STORAGE_KEY = 'apiBaseUrl';
const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

export function normalizeApiBaseUrl(value: string | null | undefined): string {
  let url = String(value || '').trim();
  if (!url) url = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  if (!/\/api\/v1$/i.test(url)) url = `${url}/api/v1`;
  return url;
}

export function getApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeApiBaseUrl(stored);
  } catch {
    // 隐私模式/localStorage 不可用时退回构建配置。
  }
  return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL);
}

export function getServerBaseUrl(): string {
  return getApiBaseUrl().replace(/\/api\/v1\/?$/i, '');
}

export function setApiBaseUrl(value: string): string {
  const normalized = normalizeApiBaseUrl(value);
  localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent('api-base-url-changed', { detail: normalized }));
  return normalized;
}

export function resetApiBaseUrl(): string {
  localStorage.removeItem(STORAGE_KEY);
  return getApiBaseUrl();
}

export function isCustomApiBaseUrl(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}
