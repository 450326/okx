// 导入 Vue 响应式 API
import { computed, ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入认证 API
import { authApi } from '../api/services';
// 导入用户信息类型
import type { UserProfile } from '../api/types';

// 认证状态 store
export const useAuthStore = defineStore('auth', () => {
  // 当前登录用户信息
  const user = ref<UserProfile | null>(null);
  // 加载状态
  const loading = ref(false);
  // 错误信息
  const error = ref('');
  // 是否已登录
  const isAuthenticated = computed(() => Boolean(user.value));
  // 登录状态中文标签
  const authLabel = computed(() => (user.value ? `已登录: ${user.value.nickname}` : '未登录'));

  // 邮箱密码登录
  async function login(email: string, password: string) {
    loading.value = true;
    error.value = '';

    try {
      const result = await authApi.login(email, password);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('lastLoginEmail', email);
      user.value = result.user;
      return result.user;
    } catch (err) {
      error.value = String((err as any)?.message || '登录失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 生物识别登录
  async function loginWithBiometric() {
    loading.value = true;
    error.value = '';

    try {
      const result = await authApi.login('biometric@user.com', 'biometric-auto');
      localStorage.setItem('accessToken', result.accessToken);
      user.value = result.user;
      return result.user;
    } catch (err) {
      error.value = String((err as any)?.message || '生物识别登录失败');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // 退出登录：清除 token 及用户信息
  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('lastLoginEmail');
    user.value = null;
  }

  // 获取当前登录用户信息
  async function fetchMe() {
    loading.value = true;
    error.value = '';

    try {
      user.value = await authApi.me();
      return user.value;
    } catch (err) {
      const msg = (err as Error).message;
      error.value = msg || '获取用户信息失败';
      user.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  }

  // 导出 store 状态与方法
  return {
    user,
    loading,
    error,
    isAuthenticated,
    authLabel,
    login,
    loginWithBiometric,
    logout,
    fetchMe,
  };
});
