<template>
  <!-- 资金页面容器 -->
  <div class="page">
    <h1 class="page-title">资金页</h1>

    <!-- 资产总览 + 模式工具 -->
    <section class="grid-2">
      <!-- 资产总览卡片 -->
      <div class="card">
        <h2 class="section-title">资产总览</h2>
        <div class="grid-2">
          <div>
            <div class="stat-label">钱包余额</div>
            <div class="stat-value">{{ assetStore.snapshot?.walletBalance || '--' }}</div>
          </div>
          <div>
            <div class="stat-label">可用余额</div>
            <div class="stat-value">{{ assetStore.snapshot?.availableBalance || '--' }}</div>
          </div>
          <div>
            <div class="stat-label">持仓保证金</div>
            <div class="stat-value">{{ assetStore.snapshot?.positionMargin || '--' }}</div>
          </div>
          <div>
            <div class="stat-label">委托冻结</div>
            <div class="stat-value">{{ assetStore.snapshot?.orderMargin || '--' }}</div>
          </div>
        </div>
      </div>

      <!-- 模式工具卡片 -->
      <div class="card">
        <h2 class="section-title">模式工具</h2>
        <div class="panel-actions">
          <button class="ghost-btn" :disabled="exchangeStore.saving" @click="handleTestConnection()">
            测试 API 连接
          </button>
          <button class="ghost-btn" @click="bindingModalOpen = true">绑定 OKX 账户</button>
          <button class="danger-btn" :disabled="modeStore.mode !== 'simulation'" @click="resetConfirmOpen = true">
            重置模拟账户
          </button>
        </div>
        <div class="status-text">
          {{ modeStore.mode === 'simulation' ? '当前可重置模拟账户' : '真实模式下不可重置模拟账户' }}
        </div>
        <div v-if="exchangeStore.statusMessage || exchangeStore.error" class="status-text">
          {{ exchangeStore.statusMessage || exchangeStore.error }}
        </div>
      </div>
    </section>

    <!-- API 绑定信息表格 -->
    <section class="card">
      <div class="section-head">
        <h2 class="section-title">API 绑定信息</h2>
        <span class="status-text">{{ exchangeStore.loading ? '加载中...' : '已绑定账户' }}</span>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>交易所</th>
            <th>账户备注</th>
            <th>状态</th>
            <th>测试环境</th>
            <th>最近测试</th>
            <th>最近同步</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in exchangeStore.accounts" :key="item.id">
            <td>{{ item.exchange.toUpperCase() }}</td>
            <td>{{ item.label }}</td>
            <td>{{ item.status }}</td>
            <td>{{ item.isTestnet ? '是' : '否' }}</td>
            <td>{{ item.lastTestAt ? formatDisplayTime(item.lastTestAt) : '--' }}</td>
            <td>{{ item.lastSyncAt ? formatDisplayTime(item.lastSyncAt) : '--' }}</td>
            <td>
              <button
                class="danger-btn-sm"
                :disabled="exchangeStore.saving"
                @click="handleDeleteAccount(item)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!exchangeStore.accounts.length" class="empty-state">暂未绑定任何 API 账户</div>
    </section>

    <!-- 资金流水表格 -->
    <section class="card">
      <h2 class="section-title">资金流水</h2>
      <table class="table">
        <thead>
          <tr>
            <th>类型</th>
            <th>金额</th>
            <th>余额</th>
            <th>品种</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in assetStore.ledger" :key="item.id">
            <td>{{ item.type }}</td>
            <td :class="getTrendClass(item.amount)">{{ formatSignedValue(item.amount) }}</td>
            <td>{{ item.balanceAfter }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ formatDisplayTime(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!assetStore.ledger.length" class="empty-state">暂无资金流水</div>
    </section>
  </div>

  <!-- 重置模拟账户确认弹窗 -->
  <ConfirmModal
    :open="resetConfirmOpen"
    title="重置模拟账户"
    description="重置后会清空模拟持仓、模拟委托和流水，并恢复初始模拟资金。"
    warning-text="该操作只影响模拟盘数据，不会影响真实交易账户。"
    confirm-text="确认重置"
    cancel-text="取消"
    @cancel="resetConfirmOpen = false"
    @confirm="handleResetSimulation()"
  />

  <!-- 绑定 OKX 账户弹窗 -->
  <ApiBindingModal
    :open="bindingModalOpen"
    :saving="exchangeStore.saving"
    @close="bindingModalOpen = false"
    @submit="handleBindAccount"
  />
</template>

<script setup lang="ts">
// Vue 响应式工具与侦听器
import { ref, watch } from 'vue';
// API 绑定弹窗组件
import ApiBindingModal from '../components/assets/ApiBindingModal.vue';
// 通用确认弹窗组件
import ConfirmModal from '../components/common/ConfirmModal.vue';
// 资产状态管理
import { useAssetStore } from '../stores/assets';
// 交易所 API 绑定管理
import { useExchangeStore } from '../stores/exchange';
// 交易模式管理
import { useModeStore } from '../stores/mode';
// API 类型定义
import type { ExchangeAccount, ExchangeAccountPayload } from '../api/types';
// 数值格式化与涨跌颜色工具函数
import { formatSignedValue, getTrendClass } from '../utils/format';

// 各 Store 实例
const assetStore = useAssetStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
// 绑定 OKX 账户弹窗是否打开
const bindingModalOpen = ref(false);
// 重置模拟账户确认弹窗是否打开
const resetConfirmOpen = ref(false);

// 格式化时间显示
function formatDisplayTime(value: string) {
  return new Date(value).toLocaleString();
}

// 加载资金页数据
async function loadPageData() {
  await Promise.all([
    assetStore.fetchAssets(modeStore.mode),
    assetStore.fetchLedger(modeStore.mode),
    exchangeStore.fetchAccounts(),
  ]);
}

// 重置模拟账户
async function handleResetSimulation() {
  const success = await assetStore.resetSimulation();

  if (success) {
    resetConfirmOpen.value = false;
    await loadPageData();
  }
}

// 测试 API 连接
async function handleTestConnection() {
  await exchangeStore.testFirstAccount();
}

// 绑定 OKX 账户
async function handleBindAccount(payload: ExchangeAccountPayload) {
  const result = await exchangeStore.createAccount(payload);

  if (result) {
    bindingModalOpen.value = false;
    await exchangeStore.fetchAccounts();
  }
}

// 删除绑定的 API 账户
async function handleDeleteAccount(account: ExchangeAccount) {
  if (!confirm(`确定要删除 API 账户「${account.label}」吗？`)) return;
  await exchangeStore.deleteAccount(account.id);
}

// 监听交易模式变化重新加载数据
watch(
  () => modeStore.mode,
  () => {
    void loadPageData();
  },
  { immediate: true },
);
</script>

<style scoped>
/* 面板标题行 */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* 小型危险按钮 */
.danger-btn-sm {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  background: var(--color-down);
  color: #fff;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.danger-btn-sm:hover {
  opacity: 0.85;
}

.danger-btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
