<template>
  <section class="card">
    <div v-if="title || $slots.extra" class="section-head">
      <h2 v-if="title" class="section-title">{{ title }}</h2>
      <slot name="extra" />
    </div>

    <slot />

    <div v-if="empty" class="empty-state">{{ emptyText }}</div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    empty?: boolean;
    emptyText?: string;
  }>(),
  {
    title: '',
    empty: false,
    emptyText: '暂无数据',
  },
);
</script>
