<template>
  <!-- 数据表格卡片容器 -->
  <section class="card">
    <!-- 卡片头部：标题 + 额外操作插槽 -->
    <div v-if="title || $slots.extra" class="section-head">
      <h2 v-if="title" class="section-title">{{ title }}</h2>
      <!-- 额外操作区插槽 -->
      <slot name="extra" />
    </div>

    <!-- 默认内容插槽（通常用于表格内容） -->
    <slot />

    <!-- 空状态提示 -->
    <div v-if="empty" class="empty-state">{{ emptyText }}</div>
  </section>
</template>

<script setup lang="ts">
// 定义组件的 props：标题、空状态标记、空状态文案
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
