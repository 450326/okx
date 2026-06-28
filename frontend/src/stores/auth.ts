import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authApi } from '../api/services';
import type { UserProfile } from '../api/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null);
  const loading = ref(false);
  const error = ref('');
  const isAuthenticated = computed(() => Boolean(user.value));
  const authLabel = computed(() => (user.value ? `已登录: ${user.value.nickname}` : '未登录'));

  async function fetchMe() {
    loading.value = true;
    error.value = '';

    try {
      user.value = await authApi.me();
      return user.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取用户信息失败';
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
    authLabel,
    fetchMe,
  };
});
