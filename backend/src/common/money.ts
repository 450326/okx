/**
 * 账务金额统一精度：1e-8 USDT。
 *
 * 引擎对外仍使用 number，但持久化和流水汇总通过 BigInt 最小单位完成，
 * 避免多次累加后出现二进制浮点尾差。
 */
export const MONEY_SCALE = 8;
export const MONEY_UNIT = 10n ** 8n;

export function toUnits(value: number | string | null | undefined): bigint {
  if (value == null || value === '') return 0n;
  const text = String(value).trim();
  if (!text) return 0n;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return BigInt(Math.round(Number(value) * 1e8));
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] || '0');
  const fraction = (match[3] || '').padEnd(MONEY_SCALE, '0').slice(0, MONEY_SCALE);
  const exponent = Number(match[4] || 0);
  let units = whole * MONEY_UNIT + BigInt(fraction || '0');
  if (exponent > 0) units *= 10n ** BigInt(exponent);
  if (exponent < 0) units /= 10n ** BigInt(-exponent);
  return sign * units;
}

export function fromUnits(units: bigint): number {
  return Number(units) / 1e8;
}

export function roundUnits(value: number | string, digits = MONEY_SCALE): number {
  const unit = 10n ** BigInt(Math.max(0, Math.min(MONEY_SCALE, digits)));
  const units = toUnits(value);
  const factor = MONEY_UNIT / unit;
  const rounded = (units >= 0n ? units + factor / 2n : units - factor / 2n) / factor;
  return Number(rounded * factor) / 1e8;
}

export function addMoney(...values: Array<number | string>): number {
  return fromUnits(values.reduce((sum, value) => sum + toUnits(value), 0n));
}

export function sumLedger(entries: Array<{ amount: number | string }>): number {
  return addMoney(...entries.map((entry) => entry.amount));
}
