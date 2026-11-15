// 引入 axios HTTP 客户端库
import axios from 'axios';
// 引入 axios 错误类型
import type { AxiosError } from 'axios';
// 引入 API 响应信封类型
import type { ApiEnvelope, LoginResponse } from './types';

// API 基础地址
const API_BASE_URL = 'http://localhost:3000/api/v1';
let refreshPromise: Promise<string | null> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly reason?: string,
    readonly suggestedAction?: string,
    readonly data?: unknown,
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
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { timeout: 10000 },
      );
      const data = response.data?.data;
      if (!data?.accessToken || !data?.refreshToken) return null;
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
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
      ),
    );
  },
);

// GET 请求封装
export function get<T>(url: string, params?: Record<string, unknown>) {
  return http.get<ApiEnvelope<T>, T>(url, { params });
}

// POST 请求封装
export function post<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http.post<ApiEnvelope<T>, T, D>(url, data);
}

// PUT 请求封装
export function put<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http.put<ApiEnvelope<T>, T, D>(url, data);
}

// DELETE 请求封装
export function del<T>(url: string) {
  return http.delete<ApiEnvelope<T>, T>(url);
}
