<template>
  <div class="login-page" :class="{ 'login-dark': isDark }">
    <div class="login-bg"></div>
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <div class="logo-icon">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="10" fill="currentColor" opacity="0.12"/>
                <path d="M18 8L26 14V22L18 28L10 22V14L18 8Z" stroke="currentColor" stroke-width="2.2" fill="none"/>
                <circle cx="18" cy="18" r="3.5" fill="currentColor"/>
              </svg>
            </div>
            <span class="logo-text">Futures&nbsp;<span class="logo-accent">Pro</span></span>
          </div>
          <h1 class="login-title">欢迎回来</h1>
          <p class="login-subtitle">登录您的账户以继续</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
          <div class="field">
            <label for="email">邮箱地址</label>
            <div class="input-wrap">
              <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <input
                id="email"
                v-model="form.email"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                :disabled="submitting"
              />
            </div>
          </div>

          <div class="field">
            <label for="password">密码</label>
            <div class="input-wrap">
              <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="请输入密码"
                autocomplete="current-password"
                :disabled="submitting"
              />
              <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">
                <svg v-if="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <button type="submit" class="login-btn" :disabled="!canSubmit || submitting">
            <span v-if="submitting" class="btn-loader"></span>
            <span v-else>登录</span>
          </button>
        </form>

        <div class="login-divider">
          <span>或</span>
        </div>

        <button
          class="faceid-btn"
          :disabled="faceLoading || !biometricSupported"
          @click="handleFaceLogin"
        >
          <svg v-if="faceLoading" class="face-spinner" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2.5" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
          </svg>
          <template v-else>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 8V6a2 2 0 012-2h4"/>
              <path d="M16 4h4a2 2 0 012 2v2"/>
              <path d="M22 16v2a2 2 0 01-2 2h-4"/>
              <path d="M8 20H6a2 2 0 01-2-2v-2"/>
              <circle cx="12" cy="15" r="1"/>
              <circle cx="9" cy="11" r="1"/>
              <circle cx="15" cy="11" r="1"/>
            </svg>
            <span>{{ biometricSupported ? '面容 ID / 生物识别登录' : '当前设备不支持面容解锁' }}</span>
          </template>
        </button>

        <div v-if="errorMsg" class="login-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {{ errorMsg }}
        </div>

        <div class="login-footer">
          <span class="footer-text">Futures Pro</span>
          <span class="footer-dot">·</span>
          <span class="footer-text">模拟交易平台</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const form = ref({ email: '', password: '' });
const showPassword = ref(false);
const submitting = ref(false);
const faceLoading = ref(false);
const errorMsg = ref('');
const biometricSupported = ref(false);

const isDark = computed(() => document.documentElement.getAttribute('data-theme') !== 'light');
const canSubmit = computed(() => form.value.email.trim() && form.value.password.trim());

onMounted(async () => {
  if (typeof PublicKeyCredential !== 'undefined' && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
    biometricSupported.value = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }
});

async function handleLogin() {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMsg.value = '';

  try {
    await authStore.login(form.value.email, form.value.password);
    router.replace('/');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '登录失败，请重试';
  } finally {
    submitting.value = false;
  }
}

async function handleFaceLogin() {
  if (!biometricSupported.value) return;
  faceLoading.value = true;
  errorMsg.value = '';

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array(32),
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 60000,
      },
    } as CredentialRequestOptions);

    if (credential) {
      await authStore.loginWithBiometric();
      router.replace('/');
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      errorMsg.value = '面容验证已取消';
    } else {
      errorMsg.value = '面容验证失败，请使用密码登录';
    }
  } finally {
    faceLoading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99, 255, 152, 0.06) 0%, transparent 70%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(187, 255, 39, 0.04) 0%, transparent 60%);
  pointer-events: none;
}

.login-container {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: 24px;
}

.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 40px 36px 32px;
  animation: fadeUp 0.5s ease both;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.logo-icon {
  color: var(--color-up);
}

.logo-text {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.logo-accent {
  color: var(--color-up);
}

.login-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.03em;
}

.login-subtitle {
  color: var(--text-secondary);
  font-size: 15px;
  margin: 0;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--text-secondary);
  opacity: 0.6;
  pointer-events: none;
  flex-shrink: 0;
}

.input-wrap input {
  width: 100%;
  padding: 12px 14px 12px 42px;
  border: 1.5px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 500;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-wrap input:focus {
  border-color: var(--color-up);
  box-shadow: 0 0 0 3px rgba(99, 255, 152, 0.12);
}

.input-wrap input::placeholder {
  color: var(--text-secondary);
  opacity: 0.5;
  font-weight: 400;
}

.toggle-pw {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-secondary);
  opacity: 0.5;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  transition: opacity 0.15s;
}

.toggle-pw:hover {
  opacity: 1;
}

.login-btn {
  margin-top: 6px;
  padding: 13px;
  border: none;
  border-radius: 14px;
  background: var(--color-up);
  color: #0a0e18;
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
}

.login-btn:hover:not(:disabled) {
  opacity: 0.88;
}

.login-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-loader {
  width: 22px;
  height: 22px;
  border: 2.5px solid #0a0e18;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-divider {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 22px 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.faceid-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px;
  border: 1.5px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-soft);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.faceid-btn:hover:not(:disabled) {
  border-color: var(--text-secondary);
  background: var(--bg-card);
}

.faceid-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.face-spinner {
  animation: spin 0.7s linear infinite;
  color: var(--text-secondary);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(246, 70, 93, 0.08);
  color: var(--color-down);
  font-size: 13px;
  font-weight: 600;
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 28px;
}

.footer-text {
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.6;
}

.footer-dot {
  color: var(--text-secondary);
  opacity: 0.3;
}
</style>
