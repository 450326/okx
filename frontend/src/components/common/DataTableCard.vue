<template>
  <section class="card">
    <div v-if="title || $slots.extra" class="section-head">
      <h2 v-if="title" class="section-title">{{ title }}</h2>
      <slot name="extra" />
    </div>

    <slot />

    <div v-if="empty" class="empty-state">{{ resolvedEmptyText }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { $t } from '../../utils/i18n';

const props = withDefaults(
  defineProps<{
    title?: string;
    empty?: boolean;
    emptyText?: string;
  }>(),
  {
    title: '',
    empty: false,
    emptyText: '',
  },
);

const resolvedEmptyText = computed(() => props.emptyText || $t('common.noData'));
</script>
