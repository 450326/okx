<template>
  <section class="card">
    <div class="panel-head">
      <h2 class="section-title">盘口深度</h2>
      <span class="status-text">{{ loading ? '加载中...' : '实时深度' }}</span>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>价格</th>
          <th>数量</th>
          <th>累计</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in asks" :key="`ask-${item.price}`">
          <td class="down">{{ item.price }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.total }}</td>
        </tr>
        <tr v-for="item in bids" :key="`bid-${item.price}`">
          <td class="up">{{ item.price }}</td>
          <td>{{ item.qty }}</td>
          <td>{{ item.total }}</td>
        </tr>
      </tbody>
    </table>

    <div v-if="!asks.length && !bids.length && !loading" class="empty-state">暂无盘口数据</div>
  </section>
</template>

<script setup lang="ts">
import type { DepthLevel } from '../../api/types';

defineProps<{
  asks: DepthLevel[];
  bids: DepthLevel[];
  loading: boolean;
}>();
</script>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
