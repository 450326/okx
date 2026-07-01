<template>
  <div v-if="open" class="modal-mask" @click.self="emit('close')">
    <div class="modal-panel card">
      <h3 class="section-title">{{ $t('apiBinding.title') }}</h3>
      <div class="form-grid">
        <div class="field">
          <label>{{ $t('apiBinding.exchange') }}</label>
          <input :value="form.exchange" disabled />
        </div>
        <div class="field">
          <label>{{ $t('apiBinding.label') }}</label>
          <input v-model="form.label" placeholder="例如 主账户 / 量化账户" />
        </div>
        <div class="field">
          <label>{{ $t('apiBinding.apiKey') }}</label>
          <input v-model="form.apiKey" placeholder="请输入 API Key" />
        </div>
        <div class="field">
          <label>{{ $t('apiBinding.apiSecret') }}</label>
          <input v-model="form.apiSecret" type="password" placeholder="请输入 API Secret" />
        </div>
        <div class="field">
          <label>{{ $t('apiBinding.passphrase') }}</label>
          <input v-model="form.passphrase" type="password" placeholder="请输入 Passphrase" />
        </div>
        <div class="field field-check">
          <label>{{ $t('apiBinding.testnet') }}</label>
          <label class="checkbox-line">
            <input v-model="form.isTestnet" type="checkbox" />
            <span>{{ $t('apiBinding.useTestnet') }}</span>
          </label>
        </div>
      </div>
      <div class="status-text">
        {{ $t('apiBinding.security') }}
      </div>
      <div class="panel-actions modal-actions">
        <button class="ghost-btn" @click="emit('close')">{{ $t('apiBinding.cancel') }}</button>
        <button class="primary-btn" :disabled="saving || !canSubmit" @click="handleSubmit()">
          {{ saving ? $t('apiBinding.saving') : $t('apiBinding.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { $t } from '../../utils/i18n';
import type { ExchangeAccountPayload } from '../../api/types';

const props = defineProps<{
  open: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: ExchangeAccountPayload];
}>();

const form = reactive<ExchangeAccountPayload>({
  exchange: 'okx',
  label: '',
  apiKey: '',
  apiSecret: '',
  passphrase: '',
  isTestnet: false,
});

const canSubmit = computed(() => Boolean(form.label && form.apiKey && form.apiSecret && form.passphrase));

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    form.exchange = 'okx';
    form.label = '';
    form.apiKey = '';
    form.apiSecret = '';
    form.passphrase = '';
    form.isTestnet = false;
  },
);

function handleSubmit() {
  emit('submit', { ...form });
}
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
  width: min(100%, 640px);
}

.modal-actions {
  margin-top: 16px;
}

.field-check {
  align-content: end;
}

.checkbox-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
}
</style>
