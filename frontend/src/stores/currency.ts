import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import axios from 'axios';

export type QuoteCurrency = 'USDT' | 'USD' | 'CNY';

const CNY_FALLBACK = 7.25;

export const useCurrencyStore = defineStore('currency', () => {
  const quote = ref<QuoteCurrency>('USDT');
  const rate = ref(1);
  const rateLoading = ref(false);

  const symbol = computed(() => {
    if (quote.value === 'USD') return '$';
    if (quote.value === 'CNY') return '¥';
    return '₮';
  });

  function setQuote(c: QuoteCurrency) {
    quote.value = c;
    localStorage.setItem('preferred_quote', c);
    if (c === 'CNY') {
      rate.value = cachedRate ?? CNY_FALLBACK;
    } else {
      rate.value = 1;
    }
  }

  function initQuote() {
    const saved = localStorage.getItem('preferred_quote') as QuoteCurrency | null;
    if (saved && ['USDT', 'USD', 'CNY'].includes(saved)) {
      quote.value = saved;
      if (saved === 'CNY') {
        rate.value = cachedRate ?? CNY_FALLBACK;
      }
    }
  }

  let cachedRate: number | null = null;
  let lastFetch = 0;

  async function fetchRate() {
    const now = Date.now();
    if (cachedRate !== null && now - lastFetch < 600_000) {
      rate.value = quote.value === 'CNY' ? cachedRate : 1;
      return;
    }
    rateLoading.value = true;
    try {
      const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 5000 });
      const cny = res.data?.rates?.CNY;
      if (cny && typeof cny === 'number') {
        cachedRate = cny;
        lastFetch = now;
        rate.value = quote.value === 'CNY' ? cny : 1;
        rateLoading.value = false;
        return;
      }
    } catch {
      // ignore
    }
    cachedRate = CNY_FALLBACK;
    rate.value = quote.value === 'CNY' ? CNY_FALLBACK : 1;
    rateLoading.value = false;
  }

  function convert(value: string | number | undefined | null): number {
    const numeric = Number(value || 0);
    if (quote.value === 'CNY') return numeric * rate.value;
    return numeric;
  }

  return { quote, symbol, rate, rateLoading, setQuote, initQuote, fetchRate, convert };
});
