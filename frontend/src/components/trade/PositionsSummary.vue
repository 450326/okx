<template>
  <section class="card">
    <h2 class="section-title">当前持仓摘要</h2>
    <table class="table">
      <thead>
        <tr>
          <th>品种</th>
          <th>方向</th>
          <th>数量</th>
          <th>未实现盈亏</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in positions" :key="item.id">
          <td>{{ item.symbol }}</td>
          <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? '多' : '空' }}</td>
          <td>{{ item.qty }}</td>
          <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!positions.length" class="empty-state">暂无持仓数据</div>
  </section>

  <section class="card">
    <h2 class="section-title">当前委托摘要</h2>
    <table class="table">
      <thead>
        <tr>
          <th>订单号</th>
          <th>类型</th>
          <th>价格</th>
          <th>数量</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in openOrders" :key="item.orderId">
          <td>{{ item.orderId }}</td>
          <td>{{ item.orderType }}</td>
          <td>{{ item.price || '--' }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.status }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!openOrders.length" class="empty-state">暂无委托数据</div>
  </section>
</template>

<script setup lang="ts">
import type { OrderItem, PositionItem } from '../../api/types';
import { formatSignedValue, getTrendClass } from '../../utils/format';

defineProps<{
  positions: PositionItem[];
  openOrders: OrderItem[];
}>();
</script>
