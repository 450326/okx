<template>
  <div class="locale-switcher">
    <button
      v-for="opt in options"
      :key="opt.code"
      :class="['locale-btn', { active: locale === opt.code }]"
      @click="switchLocale(opt.code)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18nStore, type Locale } from '../../i18n/store';

const store = useI18nStore();
const locale = computed(() => store.locale);

const options = [
  { code: 'zh' as Locale, label: '中文' },
  { code: 'en' as Locale, label: 'EN' },
  { code: 'ja' as Locale, label: '日本語' },
  { code: 'ko' as Locale, label: '한국어' },
];

function switchLocale(code: Locale) {
  store.setLocale(code);
}
</script>

<style scoped>
.locale-switcher {
  display: flex;
  gap: 2px;
  background: rgba(255,255,255,0.06);
  padding: 3px;
  border-radius: 8px;
}

.locale-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.locale-btn.active {
  background: rgba(255,255,255,0.12);
  color: var(--text-primary);
}

.locale-btn:hover {
  color: var(--text-primary);
}
</style>
