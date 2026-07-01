<template>
  <section class="card">
    <div class="panel-head">
      <h2 class="section-title">{{ $t('depth.title') }}</h2>
      <span class="status-text">{{ loading ? $t('common.loading') : $t('depth.live') }}</span>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>{{ $t('depth.price') }}</th>
          <th>{{ $t('depth.qty') }}</th>
          <th>{{ $t('depth.total') }}</th>
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

    <div v-if="!asks.length && !bids.length && !loading" class="empty-state">{{ $t('depth.noData') }}</div>
  </section>
</template>

<script setup lang="ts">
import type { DepthLevel } from '../../api/types';
import { $t } from '../../utils/i18n';

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
