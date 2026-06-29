<template>
  <!-- API 绑定弹窗遮罩层，点击遮罩关闭 -->
  <div v-if="open" class="modal-mask" @click.self="emit('close')">
    <!-- 弹窗面板 -->
    <div class="modal-panel card">
      <!-- 弹窗标题 -->
      <h3 class="section-title">绑定 OKX 账户</h3>
      <!-- 表单网格 -->
      <div class="form-grid">
        <!-- 交易所字段（固定为 okx，禁用编辑） -->
        <div class="field">
          <label>交易所</label>
          <input :value="form.exchange" disabled />
        </div>
        <!-- 账户备注字段 -->
        <div class="field">
          <label>账户备注</label>
          <input v-model="form.label" placeholder="例如 主账户 / 量化账户" />
        </div>
        <!-- API Key 字段 -->
        <div class="field">
          <label>API Key</label>
          <input v-model="form.apiKey" placeholder="请输入 API Key" />
        </div>
        <!-- Secret 字段（密码类型） -->
        <div class="field">
          <label>Secret</label>
          <input v-model="form.apiSecret" type="password" placeholder="请输入 API Secret" />
        </div>
        <!-- Passphrase 字段（密码类型） -->
        <div class="field">
          <label>Passphrase</label>
          <input v-model="form.passphrase" type="password" placeholder="请输入 Passphrase" />
        </div>
        <!-- 是否使用测试环境复选框 -->
        <div class="field field-check">
          <label>测试环境</label>
          <label class="checkbox-line">
            <input v-model="form.isTestnet" type="checkbox" />
            <span>使用 OKX 测试环境</span>
          </label>
        </div>
      </div>
      <!-- 安全提示 -->
      <div class="status-text">
        仅作平台后端绑定演示，前端不会持久化保存 `Secret` 和 `Passphrase`。
      </div>
      <!-- 操作按钮区：取消 / 保存 -->
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
// 导入 Vue 响应式工具
import { computed, reactive, watch } from 'vue';
// 导入交易所账户数据类型
import type { ExchangeAccountPayload } from '../../api/types';

// 定义组件 props：弹窗可见状态、保存中状态
const props = defineProps<{
  open: boolean;
  saving: boolean;
}>();

// 定义组件事件：关闭弹窗 / 提交绑定
const emit = defineEmits<{
  close: [];
  submit: [payload: ExchangeAccountPayload];
}>();

// 绑定表单响应式数据
const form = reactive<ExchangeAccountPayload>({
  exchange: 'okx',
  label: '',
  apiKey: '',
  apiSecret: '',
  passphrase: '',
  isTestnet: false,
});

// 计算表单是否可以提交（所有必填字段均不为空）
const canSubmit = computed(() => Boolean(form.label && form.apiKey && form.apiSecret && form.passphrase));

// 监听弹窗打开事件，打开时重置表单
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

// 提交表单
function handleSubmit() {
  emit('submit', { ...form });
}
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
  width: min(100%, 640px);
}

/* 操作按钮区上边距 */
.modal-actions {
  margin-top: 16px;
}

/* 复选框字段底部对齐 */
.field-check {
  align-content: end;
}

/* 复选框行容器 */
.checkbox-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
}
</style>
