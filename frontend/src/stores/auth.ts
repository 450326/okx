// 导入 Vue 响应式 API
import { computed, ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入认证 API
import { authApi } from '../api/services';
// 导入用户信息类型
import type { LoginResponse, LoginResult, UserProfile } from '../api/types';

let refreshPromise: Promise<string | null> | null = null;

function persistSession(result: LoginResponse): void {
  localStorage.setItem('accessToken', result.accessToken);
  localStorage.setItem('refreshToken', result.refreshToken);
}

function clearSession(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('lastLoginEmail');
}

// 认证状态 store
export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref('');
  const isAuthenticated = computed(() => Boolean(user.value));
  const authLabel = computed(() => (user.value ? `已登录: ${user.value.nickname}` : '未登录'));
  const isSuper = computed(() => Boolean(user.value?.isSuper));
  const isGuest = computed(() => Boolean(user.value?.isGuest));

  async function login(email: string, password: string): Promise<LoginResult> {
    loading.value = true;
    error.value = '';
    try {
      const result = await authApi.login(email, password);
      if ('challengeToken' in result) {
        return result;
      }
      persistSession(result);
      localStorage.setItem('lastLoginEmail', email);
      user.value = result.user;
      return result;
    } catch (err) {
      error.value = String((err as any)?.message || '登录失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function verifyTwoFactor(challengeToken: string, code: string) {
    loading.value = true;
    error.value = '';
    try {
      const result = await authApi.verifyTwoFactor(challengeToken, code);
      persistSession(result);
      user.value = result.user;
      return result;
    } catch (err) {
      error.value = String((err as any)?.message || '两步验证失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function loginAsGuest() {
    loading.value = true;
    error.value = '';
    try {
      const result = await authApi.guest();
      persistSession(result);
      user.value = result.user;
      return result.user;
    } catch (err) {
      error.value = String((err as any)?.message || '游客登录失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function loginWithBiometric() {
    return login('demo@test.com', 'demo');
  }

  // 单飞刷新：多个 401 同时发生时只发一次 refresh 请求
  async function ensureFreshAccessToken(): Promise<string | null> {
    if (refreshPromise) return refreshPromise;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    refreshPromise = (async () => {
      try {
        const result = await authApi.refresh(refreshToken);
        persistSession(result);
        user.value = result.user;
        return result.accessToken;
      } catch {
        clearSession();
        user.value = null;
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken') || undefined;
    try {
      await authApi.logout(refreshToken);
    } catch {
      // 网络失败也要清本地会话
    } finally {
      clearSession();
      user.value = null;
    }
  }

  async function fetchMe() {
    loading.value = true;
    error.value = '';
    try {
      user.value = await authApi.me();
      return user.value;
    } catch (err) {
      error.value = (err as Error).message || '获取用户信息失败';
      user.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isSuper,
    isGuest,
    authLabel,
    login,
    loginAsGuest,
    loginWithBiometric,
    verifyTwoFactor,
    ensureFreshAccessToken,
    logout,
    fetchMe,
  };
});
