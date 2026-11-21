<template>
  <button
    v-if="store.available"
    class="backend-chip"
    :class="[store.state, { busy: store.busy }]"
    type="button"
    :title="i18n.t('desktop.chipHint')"
    @click="store.toggle()"
  >
    <span class="backend-chip-dot"></span>
    <span class="backend-chip-label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDesktopBackendStore } from '../../stores/desktop-backend';
import { useI18nStore } from '../../i18n/store';

const store = useDesktopBackendStore();
const i18n = useI18nStore();

const label = computed(() => {
  switch (store.state) {
    case 'running':
      return i18n.t('desktop.backendRunning');
    case 'starting':
      return i18n.t('desktop.backendStarting');
    case 'error':
      return i18n.t('desktop.backendError');
    case 'paused':
    case 'stopped':
      return i18n.t('desktop.backendPaused');
    default:
      return i18n.t('desktop.backendRunning');
  }
});
</script>

<style scoped>
.backend-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.backend-chip:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.backend-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-warning);
}

.backend-chip.running .backend-chip-dot {
  background: var(--color-up);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-up) 20%, transparent);
}

.backend-chip.error .backend-chip-dot {
  background: var(--color-down);
}

.backend-chip.starting .backend-chip-dot {
  background: var(--color-up);
  animation: backend-chip-pulse 1.2s ease-in-out infinite;
}

@keyframes backend-chip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
