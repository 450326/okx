<template>
  <div v-if="store.blocked" class="backend-gate" role="alertdialog" aria-modal="true">
    <div class="backend-gate-card">
      <span class="backend-gate-dot" :class="store.state"></span>
      <h2 class="backend-gate-title">{{ title }}</h2>
      <p class="backend-gate-hint">{{ hint }}</p>
      <p v-if="store.message" class="backend-gate-detail">{{ store.message }}</p>
      <button
        class="backend-gate-btn"
        type="button"
        :disabled="store.busy || store.state === 'starting'"
        @click="store.start()"
      >
        {{ buttonLabel }}
      </button>
      <p class="backend-gate-foot">{{ i18n.t('desktop.trayHint') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDesktopBackendStore } from '../../stores/desktop-backend';
import { useI18nStore } from '../../i18n/store';

const store = useDesktopBackendStore();
const i18n = useI18nStore();

const title = computed(() => {
  switch (store.state) {
    case 'paused':
      return i18n.t('desktop.backendPaused');
    case 'error':
      return i18n.t('desktop.backendError');
    case 'starting':
      return i18n.t('desktop.backendStarting');
    default:
      return i18n.t('desktop.backendStopped');
  }
});

const hint = computed(() => {
  if (store.state === 'error') return i18n.t('desktop.errorHint');
  if (store.state === 'starting') return i18n.t('desktop.startingHint');
  return i18n.t('desktop.pausedHint');
});

const buttonLabel = computed(() =>
  store.busy || store.state === 'starting' ? i18n.t('desktop.backendStarting') : i18n.t('desktop.startBackend'),
);

onMounted(() => {
  store.listen();
  void store.refresh();
});
</script>

<style scoped>
.backend-gate {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(6, 9, 15, 0.72);
  backdrop-filter: blur(6px);
}

.backend-gate-card {
  width: min(460px, 100%);
  padding: 28px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--bg-card);
  box-shadow: var(--shadow-soft);
  text-align: center;
}

.backend-gate-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-warning);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-warning) 18%, transparent);
}

.backend-gate-dot.error {
  background: var(--color-down);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-down) 18%, transparent);
}

.backend-gate-dot.starting {
  background: var(--color-up);
  animation: backend-gate-pulse 1.2s ease-in-out infinite;
}

@keyframes backend-gate-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.backend-gate-title {
  margin: 16px 0 8px;
  font-size: 22px;
  color: var(--text-primary);
}

.backend-gate-hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.backend-gate-detail {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-soft);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}

.backend-gate-btn {
  margin-top: 20px;
  width: 100%;
  padding: 12px 18px;
  border: none;
  border-radius: 12px;
  background: var(--color-up);
  color: #04120c;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.backend-gate-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.backend-gate-foot {
  margin: 14px 0 0;
  font-size: 11px;
  color: var(--text-secondary);
}
</style>
