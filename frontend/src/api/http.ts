import axios from 'axios';
import type { AxiosError } from 'axios';
import type { ApiEnvelope } from './types';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

http.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken');

  if (accessToken) {
    // Keep auth handling centralized so page code only focuses on business data.
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiEnvelope<unknown>;

    if (payload && typeof payload.code === 'number') {
      if (payload.code !== 0) {
        return Promise.reject(new Error(payload.message || '请求失败'));
      }

      return payload.data;
    }

    return response.data;
  },
  (error: AxiosError<{ message?: string }>) => {
    const message = error.response?.data?.message || error.message || '网络请求失败';
    return Promise.reject(new Error(message));
  },
);

export function get<T>(url: string, params?: Record<string, unknown>) {
  return http.get<ApiEnvelope<T>, T>(url, { params });
}

export function post<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http.post<ApiEnvelope<T>, T, D>(url, data);
}

export function put<T, D = Record<string, unknown>>(url: string, data?: D) {
  return http.put<ApiEnvelope<T>, T, D>(url, data);
}

export function del<T>(url: string) {
  return http.delete<ApiEnvelope<T>, T>(url);
}
