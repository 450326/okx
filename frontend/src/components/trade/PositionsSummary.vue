<template>
  <!-- 当前持仓摘要卡片 -->
  <section class="card">
    <h2 class="section-title">{{ $t('summary.positionTitle') }}</h2>
    <!-- 持仓数据表格 -->
    <table class="table">
      <!-- 表头：品种 / 方向 / 数量 / 未实现盈亏 -->
      <thead>
        <tr>
          <th>{{ $t('summary.symbol') }}</th>
          <th>{{ $t('summary.direction') }}</th>
          <th>{{ $t('summary.qty') }}</th>
          <th>{{ $t('summary.pnl') }}</th>
        </tr>
      </thead>
      <!-- 表体：持仓列表 -->
      <tbody>
        <tr v-for="item in positions" :key="item.id">
          <td>{{ item.symbol }}</td>
          <td :class="item.side === 'long' ? 'up' : 'down'">{{ item.side === 'long' ? $t('summary.long') : $t('summary.short') }}</td>
          <td>{{ item.qty }}</td>
          <td :class="getTrendClass(item.unrealizedPnl)">{{ formatSignedValue(item.unrealizedPnl) }}</td>
        </tr>
      </tbody>
    </table>
    <!-- 无持仓时显示空状态 -->
    <div v-if="!positions.length" class="empty-state">{{ $t('summary.noPosition') }}</div>
  </section>

  <!-- 当前委托摘要卡片 -->
  <section class="card">
    <h2 class="section-title">{{ $t('summary.orderTitle') }}</h2>
    <!-- 委托数据表格 -->
    <table class="table">
      <!-- 表头：订单号 / 类型 / 价格 / 数量 / 状态 -->
      <thead>
        <tr>
          <th>{{ $t('summary.orderId') }}</th>
          <th>{{ $t('summary.type') }}</th>
          <th>{{ $t('summary.price') }}</th>
          <th>{{ $t('summary.qty') }}</th>
          <th>{{ $t('summary.status') }}</th>
        </tr>
      </thead>
      <!-- 表体：委托列表 -->
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
    <!-- 无委托时显示空状态 -->
    <div v-if="!openOrders.length" class="empty-state">{{ $t('summary.noOrder') }}</div>
  </section>
</template>

<script setup lang="ts">
import { $t } from '../../utils/i18n';
// 导入持仓和订单数据类型
import type { OrderItem, PositionItem } from '../../api/types';
// 导入格式化工具函数
import { formatSignedValue, getTrendClass } from '../../utils/format';

// 定义 props：持仓列表和当前委托列表
defineProps<{
  positions: PositionItem[];
  openOrders: OrderItem[];
}>();
</script>
