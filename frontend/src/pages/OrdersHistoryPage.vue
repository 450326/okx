<template>
  <!-- 历史订单页面容器 -->
  <div class="page">
    <h1 class="page-title">历史订单页</h1>

    <!-- 历史委托表格 -->
    <section class="card">
      <h2 class="section-title">历史委托</h2>
      <table class="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>品种</th>
            <th>方向</th>
            <th>类型</th>
            <th>委托价</th>
            <th>成交均价</th>
            <th>数量</th>
            <th>手续费</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in orderStore.historyOrders" :key="item.orderId">
            <td>{{ item.orderId }}</td>
            <td>{{ item.symbol }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ formatDirection(item) }}</td>
            <td>{{ item.orderType }}</td>
            <td>{{ item.price || '-' }}</td>
            <td>{{ item.avgFillPrice || '-' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.fee || '-' }}</td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.historyOrders.length" class="empty-state">暂无历史订单</div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Vue 侦听器
import { watch } from 'vue';
// 交易模式管理
import { useModeStore } from '../stores/mode';
// 订单状态管理
import { useOrderStore } from '../stores/orders';
// 订单类型定义
import type { OrderItem } from '../api/types';

// 各 Store 实例
const modeStore = useModeStore();
const orderStore = useOrderStore();

// 格式化订单方向文字（开多/开空/平多/平空）
function formatDirection(item: OrderItem): string {
  if (item.action === 'open') {
    return item.side === 'long' ? '开多' : '开空';
  }
  if (item.action === 'close') {
    return item.side === 'long' ? '平多' : '平空';
  }
  return item.side === 'long' ? '多' : '空';
}

// 加载历史订单数据
async function loadPageData() {
  await orderStore.fetchHistory(modeStore.mode);
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
