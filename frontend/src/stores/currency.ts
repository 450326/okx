import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export type QuoteCurrency = 'USDT' | 'USD';

export const useCurrencyStore = defineStore('currency', () => {
  const quote = ref<QuoteCurrency>('USDT');

  const symbol = computed(() => (quote.value === 'USD' ? '$' : '₮'));

  function setQuote(c: QuoteCurrency) {
    quote.value = c;
    localStorage.setItem('preferred_quote', c);
  }

  function initQuote() {
    const saved = localStorage.getItem('preferred_quote') as QuoteCurrency | null;
    if (saved && ['USDT', 'USD'].includes(saved)) {
      quote.value = saved;
    }
  }

  return { quote, symbol, setQuote, initQuote };
});
