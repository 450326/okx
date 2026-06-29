// 导入 Vue 响应式 API
import { computed, ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入交易所 API
import { exchangeApi } from '../api/services';
// 导入交易所账户类型
import type { ExchangeAccount, ExchangeAccountPayload } from '../api/types';

// 交易所 API 账户状态 store
export const useExchangeStore = defineStore('exchange', () => {
  // API 账户列表
  const accounts = ref<ExchangeAccount[]>([]);
  // 加载状态
  const loading = ref(false);
  // 保存/操作中状态
  const saving = ref(false);
  // 错误信息
  const error = ref('');
  // 状态提示消息
  const statusMessage = ref('');

  // 是否存在已激活的 API 账户
  const hasActiveAccount = computed(() => accounts.value.some((item) => item.status === 'active'));

  // 获取所有绑定的 API 账户
  async function fetchAccounts() {
    loading.value = true;
    error.value = '';

    try {
      const data = await exchangeApi.getAccounts();
      accounts.value = data.list;
      return accounts.value;
    } catch (err) {
      error.value = (err as any)?.message || '获取 API 绑定信息失败';
      accounts.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  // 创建/绑定新的 API 账户
  async function createAccount(payload: ExchangeAccountPayload) {
    saving.value = true;
    error.value = '';
    statusMessage.value = '';

    try {
      const account = await exchangeApi.createAccount(payload);
      accounts.value = [account, ...accounts.value.filter((item) => item.id !== account.id)];
      statusMessage.value = 'API 账户绑定成功';
      return account;
    } catch (err) {
      error.value = (err as any)?.message || '绑定 API 账户失败';
      return null;
    } finally {
      saving.value = false;
    }
  }

  // 测试第一个 API 账户的连接
  async function testFirstAccount() {
    const firstAccount = accounts.value[0];
    if (!firstAccount) {
      statusMessage.value = '请先绑定 OKX 账户';
      return false;
    }
    saving.value = true;
    error.value = '';
    statusMessage.value = '';
    try {
      const result = await exchangeApi.testAccount(firstAccount.id);
      statusMessage.value = result.connected ? 'API 连接测试成功' : 'API 连接测试失败';
      return result.connected;
    } catch (err) {
      error.value = (err as any)?.message || '测试 API 连接失败';
      return false;
    } finally {
      saving.value = false;
    }
  }

  // 删除指定的 API 账户
  async function deleteAccount(id: string) {
    saving.value = true;
    error.value = '';
    statusMessage.value = '';
    try {
      await exchangeApi.deleteAccount(id);
      accounts.value = accounts.value.filter((item) => item.id !== id);
      statusMessage.value = 'API 账户已删除';
      return true;
    } catch (err) {
      error.value = (err as any)?.message || '删除 API 账户失败';
      return false;
    } finally {
      saving.value = false;
    }
  }

  // 导出 store 状态与方法
  return {
    accounts, loading, saving, error, statusMessage,
    hasActiveAccount,
    fetchAccounts, createAccount, testFirstAccount, deleteAccount,
  };
});
