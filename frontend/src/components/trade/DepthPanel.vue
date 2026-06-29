<template>
  <!-- 盘口深度卡片 -->
  <section class="card">
    <!-- 盘口头部：标题 + 状态 -->
    <div class="panel-head">
      <h2 class="section-title">盘口深度</h2>
      <span class="status-text">{{ loading ? '加载中...' : '实时深度' }}</span>
    </div>

    <!-- 盘口深度数据表格 -->
    <table class="table">
      <!-- 表头：价格 / 数量 / 累计 -->
      <thead>
        <tr>
          <th>价格</th>
          <th>数量</th>
          <th>累计</th>
        </tr>
      </thead>
      <!-- 表体：卖盘 + 买盘 -->
      <tbody>
        <!-- 卖盘列表（降序排列，最靠近最新价的卖单在上方） -->
        <tr v-for="item in asks" :key="`ask-${item.price}`">
          <td class="down">{{ item.price }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.total }}</td>
        </tr>
        <!-- 买盘列表（降序排列，最靠近最新价的买单在上方） -->
        <tr v-for="item in bids" :key="`bid-${item.price}`">
          <td class="up">{{ item.price }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.total }}</td>
        </tr>
      </tbody>
    </table>

    <!-- 无数据且非加载状态时显示空状态 -->
    <div v-if="!asks.length && !bids.length && !loading" class="empty-state">暂无盘口数据</div>
  </section>
</template>

<script setup lang="ts">
// 导入盘口深度数据类型
import type { DepthLevel } from '../../api/types';

// 定义 props：卖盘深度、买盘深度、加载状态
defineProps<{
  asks: DepthLevel[];
  bids: DepthLevel[];
  loading: boolean;
}>();
</script>

<style scoped>
/* 盘口面板头部：标题与状态水平分布 */
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
