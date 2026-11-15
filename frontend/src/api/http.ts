// 引入 axios HTTP 客户端库
import axios from 'axios';
// 引入 axios 错误类型
import type { AxiosError } from 'axios';
// 引入 API 响应信封类型
import type { ApiEnvelope, LoginResponse } from './types';
import { getApiBaseUrl } from '../config/api';
import { markFresh, markStale, clearStale } from '../utils/api-status';

// API 基础地址：构建时 VITE_API_BASE_URL，运行时可由服务地址设置页覆盖。
const API_BASE_URL = getApiBaseUrl();
let refreshPromise: Promise<string | null> | null = null;

interface RequestPolicy {
  timeout: number;
  retries: number;
  cacheMs: number;
  staleWhileRevalidate: boolean;
  staleIfError: boolean;
  label: string;
}

const cache = new Map<string, { data: unknown; at: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function resolveGetPolicy(url: string, params?: Record<string, unknown>): RequestPolicy {
  if (url === '/health') {
    return { timeout: 8000, retries: 1, cacheMs: 0, staleWhileRevalidate: false, staleIfError: false, label: '健康检查' };
  }
  if (url.startsWith('/account') || url.startsWith('/positions') || url.startsWith('/orders')) {
    return { timeout: 10000, retries: 1, cacheMs: 3000, staleWhileRevalidate: false, staleIfError: true, label: '账户/持仓' };
  }
  if (url === '/market/symbols' || url === '/spot/markets') {
    return { timeout: 30000, retries: 1, cacheMs: 60000, staleWhileRevalidate: true, staleIfError: true, label: '品种列表' };
  }
  if (url === '/market/tickers') {
    const symbols = String(params?.symbols || '')
      .split(',')
      .filter(Boolean);
    if (symbols.length <= 1) {
      return { timeout: 10000, retries: 1, cacheMs: 1000, staleWhileRevalidate: false, staleIfError: true, label: '单品种行情' };
    }
    return { timeout: 30000, retries: 1, cacheMs: 30000, staleWhileRevalidate: true, staleIfError: true, label: '全量行情' };
  }
  if (url.startsWith('/market/klines') || url.startsWith('/market/depth') || url.startsWith('/market/trades')) {
    return { timeout: 10000, retries: 1, cacheMs: 1000, staleWhileRevalidate: false, staleIfError: true, label: '单品种行情' };
  }
  if (url === '/spot/tickers') {
    return { timeout: 30000, retries: 1, cacheMs: 30000, staleWhileRevalidate: true, staleIfError: true, label: '现货行情' };
  }
  if (url.startsWith('/prediction')) {
    return { timeout: 30000, retries: 1, cacheMs: 30000, staleWhileRevalidate: true, staleIfError: true, label: '预测市场' };
  }
  return { timeout: 10000, retries: 1, cacheMs: 0, staleWhileRevalidate: false, staleIfError: false, label: '请求' };
}

function stableParams(params?: Record<string, unknown>): string {
  if (!params) return '';
  return JSON.stringify(
    Object.keys(params)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        if (params[key] !== undefined) result[key] = params[key];
        return result;
      }, {}),
  );
}

function cacheKey(url: string, params?: Record<string, unknown>): string {
  const token = localStorage.getItem('accessToken') || 'anon';
  return `${token}|${url}|${stableParams(params)}`;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status == null) return true;
  if (error.status === 200) return error.code === 5001 || error.code === 5002;
  return error.status >= 500 || error.status === 429;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGet<T>(
  url: string,
  params: Record<string, unknown> | undefined,
  policy: RequestPolicy,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
    try {
      return (await http.get<ApiEnvelope<T>, T>(url, { params, timeout: policy.timeout })) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= policy.retries || !isRetryable(error)) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

function backgroundRefresh<T>(key: string, url: string, params: Record<string, unknown> | undefined, policy: RequestPolicy): void {
  if (inFlight.has(key)) return;
  const promise = requestGet<T>(url, params, policy)
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      markFresh(key);
    })
    .catch(() => {
      // 保留旧数据与 stale 标记，等下一次请求/轮询继续刷新。
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
}

function invalidateWriteCache(url: string): void {
  invalidateApiCache(['/account', '/positions', '/orders', '/prediction', '/spot', url]);
}

export function invalidateApiCache(prefixes: string[]): void {
  for (const key of cache.keys()) {
    const parts = key.split('|');
    const cachedUrl = parts[1] || '';
    if (prefixes.some((prefix) => cachedUrl === prefix || cachedUrl.startsWith(prefix))) {
      cache.delete(key);
    }
  }
}

export function clearApiCache(): void {
  cache.clear();
  inFlight.clear();
  clearStale();
}


export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly reason?: string,
    readonly suggestedAction?: string,
    readonly data?: unknown,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;
  refreshPromise = (async () => {
    try {
      const response = await axios.post<ApiEnvelope<LoginResponse>>(
        `${getApiBaseUrl()}/auth/refresh`,
        { refreshToken },
        { timeout: 10000 },
      );
      const data = response.data?.data;
      if (!data?.accessToken || !data?.refreshToken) return null;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      clearApiCache();
      return data.accessToken;
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// 创建 axios 实例并配置基础参数
export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// 设置页保存后无需刷新也能让后续 Axios 请求使用新地址。
window.addEventListener('api-base-url-changed', (event) => {
  const detail = (event as CustomEvent<string>).detail;
  if (detail) http.defaults.baseURL = detail;
});

// 请求拦截器：自动附加 JWT 令牌
http.interceptors.request.use((config) => {
  // 从 localStorage 获取访问令牌
  const accessToken = localStorage.getItem('accessToken');
  // 如果令牌存在则添加到请求头
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  // 只有超级权限账号才允许在实盘下请求模拟数据；服务端会再次校验。
  if (localStorage.getItem('simulationOverlay') === '1') {
    config.headers['X-Simulation-Overlay'] = '1';
  }
  // 返回配置
  return config;
});

// 响应拦截器：统一处理响应数据与错误
http.interceptors.response.use(
  (response) => {
    // 将响应数据解析为 ApiEnvelope 格式
    const payload = response.data as ApiEnvelope<unknown>;
    // 检查是否是标准 API 响应格式
    if (payload && typeof payload.code === 'number') {
      // 业务状态码非 0 表示失败
      if (payload.code !== 0) {
        return Promise.reject(
          new ApiError(
            payload.message || '请求失败',
            payload.code,
            payload.reason,
            payload.suggestedAction,
            payload.data,
            response.status,
          ),
        );
      }
      // 返回业务数据本体
      return payload.data;
    }
    // 非标准格式直接返回原始数据
    return response.data;
  },
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const config = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (
      status === 401 &&
      config &&
      !config._retry &&
      !url.startsWith('/auth/login') &&
      !url.startsWith('/auth/register') &&
      !url.startsWith('/auth/guest') &&
      !url.startsWith('/auth/refresh')
    ) {
      config._retry = true;
      return refreshAccessToken().then((token) => {
        if (!token) {
          if (location.pathname !== '/login') location.href = '/login';
          return Promise.reject(new Error('登录已过期，请重新登录'));
        }
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
        return http(config);
      });
    }

    // 没有 HTTP 响应通常表示地址不可达、DNS/端口错误或设备离线。
    if (!error.response) {
      return Promise.reject(
        new ApiError(
          '无法连接服务器，请检查网络或服务地址',
          -1,
          'server_unreachable',
          '打开「服务地址设置」并测试服务器连通性',
        ),
      );
    }

    // 提取错误信息，优先使用服务端返回的消息
    const body = error.response?.data as
      | { message?: string; code?: number; reason?: string; suggestedAction?: string; data?: unknown }
      | undefined;
    const message = body?.message || error.message || '网络请求失败';
    return Promise.reject(
      new ApiError(
        message,
        body?.code ?? error.response?.status ?? -1,
        body?.reason,
        body?.suggestedAction,
        body?.data,
        error.response?.status,
      ),
    );
  },
);

// GET 请求封装：按路径分级超时、重试、缓存和 stale-while-revalidate。
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const policy = resolveGetPolicy(url, params);
  if (policy.cacheMs <= 0) return requestGet<T>(url, params, policy);

  const key = cacheKey(url, params);
  const cached = cache.get(key);
  const age = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY;

  if (cached && age <= policy.cacheMs) {
    markFresh(key);
    return cached.data as T;
  }

  if (cached && policy.staleWhileRevalidate) {
    markStale(key, policy.label);
    backgroundRefresh<T>(key, url, params, policy);
    return cached.data as T;
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = requestGet<T>(url, params, policy)
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      markFresh(key);
      return data;
    })
    .catch((error) => {
      if (cached && policy.staleIfError) {
        markStale(key, policy.label);
        return cached.data as T;
      }
      throw error;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

// 写操作固定 8 秒超时，不重试；订单幂等由 clientOrderId 负责。
function writeConfig() {
  return { timeout: 8000 };
}

// POST 请求封装
export function post<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http
    .post<ApiEnvelope<T>, T, D>(url, data, writeConfig())
    .then((result) => {
      invalidateWriteCache(url);
      return result;
    });
}

// PUT 请求封装
export function put<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http
    .put<ApiEnvelope<T>, T, D>(url, data, writeConfig())
    .then((result) => {
      invalidateWriteCache(url);
      return result;
    });
}

// DELETE 请求封装
export function del<T>(url: string) {
  return http.delete<ApiEnvelope<T>, T>(url, writeConfig()).then((result) => {
    invalidateWriteCache(url);
    return result;
  });
}
