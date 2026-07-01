<template>
  <div v-if="open" class="modal-mask" @click.self="emit('cancel')">
    <div class="modal-panel card">
      <div class="modal-head">
        <h3 class="section-title">{{ title }}</h3>
      </div>
      <p class="modal-text">{{ description }}</p>
      <div v-if="warningText" class="modal-warning">{{ warningText }}</div>
      <div class="panel-actions">
        <button class="ghost-btn" @click="emit('cancel')">{{ resolvedCancelText }}</button>
        <button class="primary-btn" :disabled="loading || !confirmEnabled" @click="emit('confirm')">
          {{ loading ? $t('common.processing') : resolvedConfirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { $t } from '../../utils/i18n';

const props = withDefaults(
  defineProps<{
  open: boolean;
  title: string;
  description: string;
  warningText?: string;
  confirmText?: string;
  cancelText?: string;
  confirmTextKey?: string;
  cancelTextKey?: string;
  loading?: boolean;
  confirmEnabled?: boolean;
  }>(),
  {
    warningText: '',
    confirmText: '',
    cancelText: '',
    confirmTextKey: '',
    cancelTextKey: '',
    loading: false,
    confirmEnabled: true,
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const resolvedConfirmText = computed(() => props.confirmTextKey ? $t(props.confirmTextKey) : (props.confirmText || $t('common.confirm')));
const resolvedCancelText = computed(() => props.cancelTextKey ? $t(props.cancelTextKey) : (props.cancelText || $t('common.cancel')));
</script>

<style scoped>
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

.modal-panel {
  width: min(100%, 520px);
}

.modal-head {
  margin-bottom: 12px;
}

.modal-text {
  margin: 0 0 12px;
  color: var(--text-primary);
  line-height: 1.6;
}

.modal-warning {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(245, 166, 35, 0.14);
  color: var(--color-warning);
  font-size: 14px;
}
</style>
