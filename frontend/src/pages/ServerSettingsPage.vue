<template>
  <div class="server-page">
    <div class="server-card card">
      <h1 class="section-title">{{ $t('serverSettings.title') }}</h1>
      <p class="server-hint">{{ $t('serverSettings.hint') }}</p>

      <label class="server-label" for="serverUrl">{{ $t('serverSettings.address') }}</label>
      <input
        id="serverUrl"
        v-model="serverUrl"
        class="server-input"
        placeholder="http://192.168.1.20:3000/api/v1"
        spellcheck="false"
      />

      <div class="server-actions">
        <button class="ghost-btn" type="button" :disabled="testing" @click="testConnection">
          {{ testing ? $t('serverSettings.testing') : $t('serverSettings.test') }}
        </button>
        <button class="primary-btn" type="button" @click="saveAndReload">
          {{ $t('serverSettings.saveReload') }}
        </button>
        <button class="ghost-btn" type="button" @click="useDefault">
          {{ $t('serverSettings.useDefault') }}
        </button>
      </div>

      <p v-if="message" :class="['server-message', messageType]">{{ message }}</p>
      <p class="server-current">{{ $t('serverSettings.current') }}: {{ currentUrl }}</p>

      <RouterLink class="server-back" to="/login">{{ $t('serverSettings.backToLogin') }}</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  getApiBaseUrl,
  normalizeApiBaseUrl,
  resetApiBaseUrl,
  setApiBaseUrl,
} from '../config/api';
import { $t } from '../utils/i18n';

const serverUrl = ref(getApiBaseUrl());
const currentUrl = computed(() => getApiBaseUrl());
const testing = ref(false);
const message = ref('');
const messageType = ref<'success' | 'error' | 'info'>('info');

async function testConnection(): Promise<void> {
  testing.value = true;
  message.value = '';
  try {
    const target = normalizeApiBaseUrl(serverUrl.value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${target}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(payload?.message || 'health check failed');
    messageType.value = 'success';
    message.value = $t('serverSettings.connected');
  } catch (error) {
    messageType.value = 'error';
    message.value =
      (error as Error)?.name === 'AbortError'
        ? $t('serverSettings.timeout')
        : $t('serverSettings.failed');
  } finally {
    testing.value = false;
  }
}

function saveAndReload(): void {
  setApiBaseUrl(serverUrl.value);
  window.location.reload();
}

function useDefault(): void {
  serverUrl.value = resetApiBaseUrl();
  messageType.value = 'info';
  message.value = $t('serverSettings.defaultSet');
}
</script>

<style scoped>
.server-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-page);
}

.server-card {
  width: min(100%, 560px);
  padding: 24px;
}

.server-hint {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.server-label {
  display: block;
  margin: 18px 0 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.server-input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-size: 13px;
}

.server-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.server-message {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 8px;
  font-size: 12px;
}

.server-message.success {
  color: var(--color-up);
  background: rgba(0, 200, 120, 0.1);
}

.server-message.error {
  color: #ff6b6b;
  background: rgba(255, 70, 70, 0.12);
}

.server-message.info {
  color: var(--text-secondary);
  background: var(--bg-soft);
}

.server-current {
  color: var(--text-secondary);
  font-size: 11px;
  word-break: break-all;
}

.server-back {
  display: inline-block;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
