<template>
  <div class="currency-switcher">
    <button
      v-for="opt in options"
      :key="opt.code"
      :class="['curr-btn', { active: quote === opt.code }]"
      @click="switchCurrency(opt.code)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCurrencyStore, type QuoteCurrency } from '../../stores/currency';

const store = useCurrencyStore();
const quote = computed(() => store.quote);

const options = [
  { code: 'USDT' as QuoteCurrency, label: '₮ USDT' },
  { code: 'USD' as QuoteCurrency, label: '$ USD' },
  { code: 'CNY' as QuoteCurrency, label: '¥ CNY' },
];

function switchCurrency(code: QuoteCurrency) {
  store.setQuote(code);
  store.fetchRate();
}
</script>

<style scoped>
.currency-switcher {
  display: flex;
  gap: 2px;
  background: rgba(255,255,255,0.06);
  padding: 3px;
  border-radius: 8px;
}

.curr-btn {
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

.curr-btn.active {
  background: rgba(255,255,255,0.12);
  color: var(--text-primary);
}

.curr-btn:hover {
  color: var(--text-primary);
}
</style>
