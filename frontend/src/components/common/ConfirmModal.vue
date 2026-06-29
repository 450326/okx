<template>
  <!-- 确认弹窗遮罩层，点击遮罩取消 -->
  <div v-if="open" class="modal-mask" @click.self="emit('cancel')">
    <!-- 弹窗面板 -->
    <div class="modal-panel card">
      <!-- 弹窗标题 -->
      <div class="modal-head">
        <h3 class="section-title">{{ title }}</h3>
      </div>
      <!-- 弹窗描述文本 -->
      <p class="modal-text">{{ description }}</p>
      <!-- 警告文本（可选） -->
      <div v-if="warningText" class="modal-warning">{{ warningText }}</div>
      <!-- 操作按钮区：取消 / 确认 -->
      <div class="panel-actions">
        <button class="ghost-btn" @click="emit('cancel')">{{ cancelText }}</button>
        <button class="primary-btn" :disabled="loading || !confirmEnabled" @click="emit('confirm')">
          {{ loading ? '处理中...' : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 定义组件 props：弹窗状态、标题、描述、警告文本、按钮文本、加载状态、确认是否可用
withDefaults(
  defineProps<{
  open: boolean;
  title: string;
  description: string;
  warningText?: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  confirmEnabled?: boolean;
  }>(),
  {
    warningText: '',
    confirmText: '确认',
    cancelText: '取消',
    loading: false,
    confirmEnabled: true,
  },
);

// 定义组件事件：确认 / 取消
const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<style scoped>
/* 遮罩层：固定全屏，居中显示弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 10, 18, 0.7);
  z-index: 50;
}

/* 弹窗面板宽度限制 */
.modal-panel {
  width: min(100%, 520px);
}

/* 弹窗头部下边距 */
.modal-head {
  margin-bottom: 12px;
}

/* 弹窗描述文本样式 */
.modal-text {
  margin: 0 0 12px;
  color: var(--text-primary);
  line-height: 1.6;
}

/* 警告文本样式 */
.modal-warning {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(245, 166, 35, 0.14);
  color: var(--color-warning);
  font-size: 14px;
}
</style>
