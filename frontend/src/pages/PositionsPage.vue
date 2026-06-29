<template>
  <!-- 持仓页面容器 -->
  <div class="page">
    <h1 class="page-title">持仓页</h1>

    <!-- 当前持仓表格 -->
    <section class="card">
      <h2 class="section-title">当前持仓</h2>
      <table class="table">
        <thead>
          <tr>
            <th>品种</th>
            <th>方向</th>
            <th>杠杆</th>
            <th>数量</th>
            <th>开仓价</th>
            <th>标记价</th>
            <th>强平价</th>
            <th>盈亏</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in positionStore.positions" :key="item.id">
            <td>{{ item.symbol }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? '多' : '空' }}</td>
            <td>{{ item.leverage }}x</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.entryPrice }}</td>
            <td>{{ item.markPrice }}</td>
            <td>{{ item.liquidationPrice }}</td>
            <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!positionStore.positions.length" class="empty-state">暂无持仓数据</div>
    </section>

    <!-- 当前委托表格 -->
    <section class="card">
      <h2 class="section-title">当前委托</h2>
      <table class="table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>品种</th>
            <th>类型</th>
            <th>方向</th>
            <th>价格</th>
            <th>数量</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in orderStore.openOrders" :key="item.orderId">
            <td>{{ item.orderId }}</td>
            <td>{{ item.symbol }}</td>
            <td>{{ item.orderType }}</td>
            <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? '开多' : '开空' }}</td>
            <td>{{ item.price || '--' }}</td>
            <td>{{ item.qty }}</td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!orderStore.openOrders.length" class="empty-state">暂无委托数据</div>
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
// 持仓状态管理
import { usePositionStore } from '../stores/positions';
// 数值格式化与涨跌颜色工具函数
import { formatSignedValue, getTrendClass } from '../utils/format';

// 各 Store 实例
const modeStore = useModeStore();
const orderStore = useOrderStore();
const positionStore = usePositionStore();

// 加载持仓与委托数据
async function loadPageData() {
  await Promise.all([
    positionStore.fetchPositions(modeStore.mode),
    orderStore.fetchOpenOrders(modeStore.mode),
  ]);
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
