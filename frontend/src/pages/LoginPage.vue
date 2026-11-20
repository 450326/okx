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
          <h1 class="login-title">{{ $t('login.welcome') }}</h1>
          <p class="login-subtitle">{{ $t('login.subtitle') }}</p>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <div v-if="mode === 'register'" class="field">
            <label for="nickname">{{ $t('login.nickname') }}</label>
            <div class="input-wrap">
              <input
                id="nickname"
                v-model="form.nickname"
                type="text"
                placeholder="Satoshi"
                autocomplete="nickname"
                :disabled="submitting"
              />
            </div>
          </div>

          <div class="field">
            <label for="email">{{ $t('login.email') }}</label>
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
            <label for="password">{{ $t('login.password') }}</label>
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

          <div v-if="twoFactorRequired" class="field">
            <label for="twoFactorCode">{{ $t('login.twoFactorCode') }}</label>
            <div class="input-wrap">
              <input
                id="twoFactorCode"
                v-model="twoFactorCode"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="000000"
                autocomplete="one-time-code"
                :disabled="submitting"
              />
            </div>
          </div>

          <button v-if="!twoFactorRequired" type="submit" class="login-btn" :disabled="!canSubmit || submitting">
            <span v-if="submitting" class="btn-loader"></span>
            <span v-else>{{ mode === 'register' ? $t('login.registerBtn') : $t('login.loginBtn') }}</span>
          </button>
          <button v-else type="button" class="login-btn" :disabled="twoFactorCode.length !== 6 || submitting" @click="handleVerifyTwoFactor">
            <span v-if="submitting" class="btn-loader"></span>
            <span v-else>{{ $t('login.verifyTwoFactor') }}</span>
          </button>

          <button v-if="!twoFactorRequired" type="button" class="mode-switch" @click="toggleMode">
            {{ mode === 'register' ? $t('login.loginPrompt') : $t('login.registerPrompt') }}
          </button>
        </form>

        <button class="forgot-link" type="button" @click="forgotOpen = !forgotOpen">
          {{ $t('login.forgotPassword') }}
        </button>

        <RouterLink class="server-link" to="/server-settings">{{ $t('serverSettings.title') }}</RouterLink>

        <div v-if="forgotOpen" class="forgot-panel">
          <input v-model="forgotEmail" class="forgot-input" type="email" :placeholder="$t('login.email')" />
          <button class="ghost-btn" type="button" :disabled="forgotBusy" @click="requestPasswordReset">
            {{ $t('login.sendResetLink') }}
          </button>
          <template v-if="forgotToken">
            <input
              v-model="forgotPassword"
              class="forgot-input"
              type="password"
              :placeholder="$t('login.newPassword')"
            />
            <button class="ghost-btn" type="button" :disabled="forgotBusy" @click="confirmPasswordReset">
              {{ $t('login.resetPassword') }}
            </button>
          </template>
          <p v-if="forgotMessage" class="login-hint">{{ forgotMessage }}</p>
        </div>

        <button class="guest-login-btn" type="button" :disabled="submitting" @click="handleGuestLogin">
          {{ $t('login.guestLogin') }}
        </button>

        <div v-if="errorMsg" class="login-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {{ errorMsg }}
        </div>

        <div class="login-footer">
          <span class="footer-text">Futures Pro</span>
          <span class="footer-dot">·</span>
          <span class="footer-text">{{ $t('login.simulated') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { authApi } from '../api/services';
import { $t } from '../utils/i18n';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const form = ref({ email: '', password: '', nickname: '' });
const mode = ref<'login' | 'register'>('login');
const showPassword = ref(false);
const submitting = ref(false);
const errorMsg = ref('');
const twoFactorRequired = ref(false);
const twoFactorCode = ref('');
const twoFactorChallenge = ref('');
const forgotOpen = ref(false);
const forgotEmail = ref('');
const forgotToken = ref('');
const forgotPassword = ref('');
const forgotMessage = ref('');
const forgotBusy = ref(false);

const isDark = computed(() => document.documentElement.getAttribute('data-theme') !== 'light');
const canSubmit = computed(() => {
  const email = form.value.email.trim();
  const password = form.value.password;
  return Boolean(email && password && (mode.value === 'login' || password.length >= 6));
});

// 没有内置账号，新用户在前端直接注册（后端 /auth/register）
function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  errorMsg.value = '';
  twoFactorRequired.value = false;
}

function handleSubmit() {
  if (!canSubmit.value) return;
  if (mode.value === 'register') {
    void handleRegister();
    return;
  }
  void handleLogin();
}

// 登录成功后回到被拦截的页面；只接受站内路径，避免开放重定向
function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
  const target = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
  router.replace(target);
}

onMounted(async () => {
  const verifyToken = typeof route.query.verifyToken === 'string' ? route.query.verifyToken : '';
  if (verifyToken) {
    try {
      await authApi.verifyEmail(verifyToken);
      errorMsg.value = $t('login.emailVerifySuccess');
    } catch (err) {
      errorMsg.value = err instanceof Error ? err.message : $t('login.errorGeneric');
    }
  }
});

async function handleLogin() {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMsg.value = '';

  try {
    const result = await authStore.login(form.value.email, form.value.password);
    if ('twoFactorRequired' in result && result.twoFactorRequired) {
      twoFactorRequired.value = true;
      twoFactorChallenge.value = result.challengeToken;
      twoFactorCode.value = '';
      return;
    }
    redirectAfterLogin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    submitting.value = false;
  }
}

// 注册成功后直接尝试登录；若后端要求邮箱验证，登录失败信息会展示在表单下方
async function handleRegister() {
  submitting.value = true;
  errorMsg.value = '';
  try {
    const email = form.value.email.trim();
    await authApi.register(email, form.value.password, form.value.nickname.trim() || undefined);
    await authStore.login(email, form.value.password);
    redirectAfterLogin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    submitting.value = false;
  }
}

async function handleVerifyTwoFactor() {
  if (!twoFactorChallenge.value || twoFactorCode.value.length !== 6) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    await authStore.verifyTwoFactor(twoFactorChallenge.value, twoFactorCode.value);
    redirectAfterLogin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    submitting.value = false;
  }
}

async function requestPasswordReset() {
  if (!forgotEmail.value.trim()) return;
  forgotBusy.value = true;
  forgotMessage.value = '';
  try {
    const result = await authApi.forgotPassword(forgotEmail.value.trim());
    if (result.devResetToken) {
      forgotToken.value = result.devResetToken;
      forgotMessage.value = $t('login.resetTokenReady');
    } else {
      forgotMessage.value = $t('login.resetEmailSent');
    }
  } catch (err) {
    forgotMessage.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    forgotBusy.value = false;
  }
}

async function confirmPasswordReset() {
  if (!forgotToken.value || forgotPassword.value.length < 6) return;
  forgotBusy.value = true;
  forgotMessage.value = '';
  try {
    await authApi.resetPassword(forgotToken.value, forgotPassword.value);
    forgotMessage.value = $t('login.resetSuccess');
    forgotToken.value = '';
    forgotPassword.value = '';
  } catch (err) {
    forgotMessage.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    forgotBusy.value = false;
  }
}

async function handleGuestLogin() {
  submitting.value = true;
  errorMsg.value = '';
  try {
    await authStore.loginAsGuest();
    redirectAfterLogin();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : $t('login.errorGeneric');
  } finally {
    submitting.value = false;
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

.mode-switch {
  margin-top: 12px;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mode-switch:hover {
  color: var(--text-primary);
  text-decoration: underline;
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

.login-hint {
  margin: 12px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.guest-login-btn {
  width: 100%;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.guest-login-btn:hover {
  color: var(--text-primary);
  border-color: var(--color-up);
}

.forgot-link {
  display: block;
  margin: 8px auto 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}

.server-link {
  display: block;
  margin: 8px auto 0;
  color: var(--text-secondary);
  font-size: 11px;
  text-align: center;
  text-decoration: underline;
}

.forgot-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.forgot-input {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 12px;
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
