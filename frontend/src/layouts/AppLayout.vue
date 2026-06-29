<template>
  <!-- 全局布局：左侧边栏 + 右侧内容区 -->
  <div class="shell">
    <!-- 侧边导航栏 -->
    <aside class="sidebar card">
      <div>
        <!-- 品牌标识 -->
        <div class="brand">Futures Pro</div>
        <div class="muted">真实与模拟期货平台</div>
      </div>

      <!-- 主导航菜单 -->
      <nav class="nav">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>

    <!-- 右侧内容区域 -->
    <div class="content">
      <!-- 顶部状态栏 -->
      <header class="topbar card">
        <div>
          <!-- 交易模式标签 -->
          <div :class="['tag', { 'tag-live': modeStore.mode === 'live' }]">{{ modeStore.modeLabel }}</div>
          <!-- 顶部资产快照 -->
          <div class="topbar-stats">
            <div>
              <div class="stat-label">账户权益</div>
              <div class="stat-value">{{ assetSnapshot?.equity || '--' }} {{ assetSnapshot?.currency || 'USDT' }}</div>
            </div>
            <div>
              <div class="stat-label">可用余额</div>
              <div class="stat-value">
                {{ assetSnapshot?.availableBalance || '--' }} {{ assetSnapshot?.currency || 'USDT' }}
              </div>
            </div>
            <div>
              <div class="stat-label">未实现盈亏</div>
              <div :class="['stat-value', unrealizedPnlClass]">
                {{ formattedUnrealizedPnl }} {{ assetSnapshot?.currency || 'USDT' }}
              </div>
            </div>
          </div>
          <!-- 认证状态与全局错误信息 -->
          <div class="status-text">{{ authStore.authLabel }}</div>
          <div v-if="globalError" class="status-text">{{ globalError }}</div>
        </div>

        <!-- 顶部操作按钮组 -->
        <div class="panel-actions">
          <button class="ghost-btn" @click="themeStore.toggleTheme()">
            主题: {{ themeStore.theme === 'dark' ? '深色' : '浅色' }}
          </button>
          <button class="ghost-btn" :disabled="modeStore.loading" @click="openModeConfirm()">
            切换到{{ modeStore.mode === 'simulation' ? '真实交易' : '模拟交易' }}
          </button>
          <button class="primary-btn" @click="handleLogout">{{ userName }} · 退出</button>
        </div>
      </header>

      <!-- 子路由渲染区 -->
      <main class="main-view">
        <RouterView />
      </main>
    </div>
  </div>

  <!-- 切换交易模式确认弹窗 -->
  <ConfirmModal
    :open="modeConfirmOpen"
    :title="modeConfirmTitle"
    :description="modeConfirmDescription"
    :warning-text="modeConfirmWarning"
    :loading="modeStore.loading"
    :confirm-enabled="modeConfirmEnabled"
    confirm-text="确认切换"
    cancel-text="取消"
    @cancel="modeConfirmOpen = false"
    @confirm="handleToggleMode()"
  />
</template>

<script setup lang="ts">
// Vue 核心工具
import { computed, onMounted, ref } from 'vue';
// Vue Router 跳转与路由出口
import { RouterLink, RouterView, useRouter } from 'vue-router';
// 通用确认弹窗组件
import ConfirmModal from '../components/common/ConfirmModal.vue';
// 资产状态管理
import { useAssetStore } from '../stores/assets';
// 认证状态管理
import { useAuthStore } from '../stores/auth';
// 交易所 API 绑定管理
import { useExchangeStore } from '../stores/exchange';
// 交易模式（模拟/实盘）管理
import { useModeStore } from '../stores/mode';
// 主题切换管理
import { useThemeStore } from '../stores/theme';
// 数值格式化与涨跌颜色工具函数
import { formatSignedValue, getTrendClass } from '../utils/format';

// 各 Store 实例
const assetStore = useAssetStore();
const authStore = useAuthStore();
const exchangeStore = useExchangeStore();
const modeStore = useModeStore();
const themeStore = useThemeStore();
const router = useRouter();
// 切换模式确认弹窗是否打开
const modeConfirmOpen = ref(false);

// 侧边导航菜单项
const navItems = [
  { to: '/', label: '首页' },
  { to: '/markets', label: '行情' },
  { to: '/trade/BTC-USDT-SWAP', label: '交易' },
  { to: '/positions', label: '持仓' },
  { to: '/assets', label: '资金' },
  { to: '/orders/history', label: '历史订单' },
];

// 资产快照数据
const assetSnapshot = computed(() => assetStore.snapshot);
// 当前用户昵称
const userName = computed(() => authStore.user?.nickname || '未登录');
// 格式化后的未实现盈亏
const formattedUnrealizedPnl = computed(() => formatSignedValue(assetSnapshot.value?.unrealizedPnl));
// 未实现盈亏的涨跌样式类
const unrealizedPnlClass = computed(() => getTrendClass(assetSnapshot.value?.unrealizedPnl));
// 全局错误信息（取各 Store 中最新错误）
const globalError = computed(() => authStore.error || modeStore.error || assetStore.error || exchangeStore.error);
// 下一个模式的文字描述
const nextModeLabel = computed(() => (modeStore.mode === 'simulation' ? '真实交易' : '模拟交易'));
// 切换模式确认弹窗标题
const modeConfirmTitle = computed(() => `切换到${nextModeLabel.value}`);
// 切换模式按钮是否可用
const modeConfirmEnabled = computed(() => modeStore.mode === 'live' || exchangeStore.hasActiveAccount);
// 切换模式确认弹窗描述
const modeConfirmDescription = computed(() =>
  modeStore.mode === 'simulation'
    ? '切换到真实交易后，下单将进入真实交易流程并产生真实盈亏，请确认你已经了解相关风险。'
    : '切换回模拟交易后，后续下单与资产变化都只影响模拟账户。',
);
// 切换模式确认弹窗警示文本
const modeConfirmWarning = computed(() =>
  modeStore.mode === 'simulation'
    ? modeConfirmEnabled.value
      ? '真实交易前请确认 API 绑定、杠杆设置与风险参数正确。'
      : '当前还没有可用的 OKX API 绑定，请先到资金页完成绑定。'
    : '',
);

// 加载全局初始化数据
async function loadGlobalData() {
  await Promise.all([authStore.fetchMe(), modeStore.fetchMode(), exchangeStore.fetchAccounts()]);
  await assetStore.fetchAssets(modeStore.mode);
}

// 打开切换模式确认弹窗
function openModeConfirm() {
  modeConfirmOpen.value = true;
}

// 执行交易模式切换
async function handleToggleMode() {
  if (!modeConfirmEnabled.value) {
    return;
  }

  const changed = await modeStore.toggleMode();

  if (changed) {
    modeConfirmOpen.value = false;
    await assetStore.fetchAssets(modeStore.mode);
  }
}

// 页面加载时获取全局数据
onMounted(() => {
  void loadGlobalData();
});

// 退出登录并跳转至登录页
function handleLogout() {
  authStore.logout();
  router.replace('/login');
}
</script>

<style scoped>
/* 全局壳布局：左侧边栏 + 右侧内容区 */
.shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  min-height: 100vh;
  padding: 16px;
}

/* 侧边栏：品牌 + 导航 */
.sidebar {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 24px;
  align-content: start;
}

/* 平台品牌名称 */
.brand {
  font-size: 24px;
  font-weight: 800;
}

/* 导航菜单容器 */
.nav {
  display: grid;
  gap: 8px;
}

/* 导航菜单项 */
.nav-item {
  padding: 12px 14px;
  border-radius: 12px;
  color: var(--text-secondary);
}

/* 当前激活的导航项 */
.nav-item.router-link-active {
  background: var(--bg-soft);
  color: var(--text-primary);
}

/* 右侧内容容器 */
.content {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
}

/* 顶部状态栏 */
.topbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

/* 顶部资产统计区 */
.topbar-stats {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  flex-wrap: wrap;
}

/* 子路由视图容器 */
.main-view {
  min-width: 0;
}

/* 窄屏自适应 */
@media (max-width: 960px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    grid-template-rows: auto auto;
  }

  .nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .topbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
