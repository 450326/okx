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
  const numeric = Number(value || 0);
  const store = useCurrencyStore();
  const sym = store.symbol;
  const formatted = numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (store.quote === 'USD') {
    return `$${formatted}`;
  }
  return `${formatted} ${sym}`;
}

export function formatSignedCurrency(value?: string | number, digits = 2): string {
  const numeric = Number(value || 0);
  const prefix = numeric >= 0 ? '+' : '';
  const store = useCurrencyStore();
  const formatted = Math.abs(numeric).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (store.quote === 'USD') {
    return `${prefix}$${formatted}`;
  }
  return `${prefix}${formatted} ${store.symbol}`;
}

export function formatCompactVolume(value?: string | number): string {
  const amount = Number(value || 0);
  const store = useCurrencyStore();
  const prefix = store.quote === 'USD' ? '$' : '₮';

  if (amount >= 1000000) {
    return `${prefix}${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${prefix}${(amount / 1000).toFixed(2)}K`;
  }
  return `${prefix}${amount.toFixed(2)}`;
}
