// 格式化带符号的数值（如 +1.23 / -1.23）
export function formatSignedValue(value?: string | number, digits = 2) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}`;
}

// 格式化百分比（如 +1.23% / -1.23%）
export function formatPercent(value?: string | number, digits = 2) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(digits)}%`;
}

// 根据数值正负返回对应的 CSS 类名（up / down）
export function getTrendClass(value?: string | number) {
  return Number(value || 0) >= 0 ? 'up' : 'down';
}
