import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { exchangeApi } from '../api/services';
import type { ExchangeAccount, ExchangeAccountPayload } from '../api/types';

export const useExchangeStore = defineStore('exchange', () => {
  const accounts = ref<ExchangeAccount[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const statusMessage = ref('');

  const hasActiveAccount = computed(() => accounts.value.some((item) => item.status === 'active'));

  async function fetchAccounts() {
    loading.value = true;
    error.value = '';

    try {
      const data = await exchangeApi.getAccounts();
      accounts.value = data.list;
      return accounts.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取 API 绑定信息失败';
      accounts.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

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
      error.value = err instanceof Error ? err.message : '绑定 API 账户失败';
      return null;
    } finally {
      saving.value = false;
    }
  }

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
      error.value = err instanceof Error ? err.message : '测试 API 连接失败';
      return false;
    } finally {
      saving.value = false;
    }
  }

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
      error.value = err instanceof Error ? err.message : '删除 API 账户失败';
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    accounts, loading, saving, error, statusMessage,
    hasActiveAccount,
    fetchAccounts, createAccount, testFirstAccount, deleteAccount,
  };
});
