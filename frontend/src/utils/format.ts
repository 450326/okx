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
