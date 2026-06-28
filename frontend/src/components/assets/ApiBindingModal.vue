<template>
  <div v-if="open" class="modal-mask" @click.self="emit('close')">
    <div class="modal-panel card">
      <h3 class="section-title">绑定 OKX 账户</h3>
      <div class="form-grid">
        <div class="field">
          <label>交易所</label>
          <input :value="form.exchange" disabled />
        </div>
        <div class="field">
          <label>账户备注</label>
          <input v-model="form.label" placeholder="例如 主账户 / 量化账户" />
        </div>
        <div class="field">
          <label>API Key</label>
          <input v-model="form.apiKey" placeholder="请输入 API Key" />
        </div>
        <div class="field">
          <label>Secret</label>
          <input v-model="form.apiSecret" type="password" placeholder="请输入 API Secret" />
        </div>
        <div class="field">
          <label>Passphrase</label>
          <input v-model="form.passphrase" type="password" placeholder="请输入 Passphrase" />
        </div>
        <div class="field field-check">
          <label>测试环境</label>
          <label class="checkbox-line">
            <input v-model="form.isTestnet" type="checkbox" />
            <span>使用 OKX 测试环境</span>
          </label>
        </div>
      </div>
      <div class="status-text">
        仅作平台后端绑定演示，前端不会持久化保存 `Secret` 和 `Passphrase`。
      </div>
      <div class="panel-actions modal-actions">
        <button class="ghost-btn" @click="emit('close')">取消</button>
        <button class="primary-btn" :disabled="saving || !canSubmit" @click="handleSubmit()">
          {{ saving ? '保存中...' : '保存绑定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
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

    // Reset stale secrets every time the modal opens to reduce accidental reuse.
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
