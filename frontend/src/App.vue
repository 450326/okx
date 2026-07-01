<template>
  <div class="app-shell">
    <header v-if="showGlobalHeader" class="global-header">
      <div class="header-left">
        <RouterLink to="/" class="logo">Kaser22</RouterLink>
      </div>
      <div class="header-right">
        <CurrencySwitcher />
        <LocaleSwitcher />
      </div>
    </header>
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import LocaleSwitcher from './components/common/LocaleSwitcher.vue';
import CurrencySwitcher from './components/common/CurrencySwitcher.vue';

const route = useRoute();
const showGlobalHeader = computed(() => route.name !== 'login');
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.global-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--bg-body);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  text-decoration: none;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 960px) {
  .global-header {
    padding: 8px 16px;
  }
}
</style>
