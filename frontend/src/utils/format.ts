import { useCurrencyStore } from '../stores/currency';

export function formatSignedValue(value?: string | number, digits = 2) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}`;
}

export function formatPercent(value?: string | number, digits = 2) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
}

export function getTrendClass(value?: string | number) {
  return Number(value || 0) >= 0 ? 'up' : 'down';
}

export function formatPrice(value?: string | number, digits = 2): string {
  const numeric = Number(value || 0);
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCurrency(value?: string | number, digits = 2): string {
  const store = useCurrencyStore();
  const numeric = store.convert(value);
  const formatted = numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${store.symbol}${formatted}`;
}

export function formatSignedCurrency(value?: string | number, digits = 2): string {
  const store = useCurrencyStore();
  const numeric = store.convert(value);
  const prefix = numeric >= 0 ? '+' : '';
  const formatted = Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${prefix}${store.symbol}${formatted}`;
}

export function formatCompactVolume(value?: string | number): string {
  const store = useCurrencyStore();
  const amount = store.convert(value);

  if (amount >= 1000000) {
    return `${store.symbol}${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${store.symbol}${(amount / 1000).toFixed(2)}K`;
  }
  return `${store.symbol}${amount.toFixed(2)}`;
}
