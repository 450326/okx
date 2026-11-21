/**
 * 账务金额统一精度：1e-8 USDT。
 *
 * 引擎对外仍使用 number，但持久化和流水汇总通过 BigInt 最小单位完成，
 * 避免多次累加后出现二进制浮点尾差。
 *
 * 换算规则：指数先作用在小数点上（不预先截断有效数字），最后统一四舍五入到
 * 1e-8，且正负对称（半远离零），例如 1.5e-8 -> 2 个最小单位。
 */
export const MONEY_SCALE = 8;
export const MONEY_UNIT = 10n ** 8n;

export function toUnits(value: number | string | null | undefined): bigint {
  if (value == null || value === '') return 0n;
  const text = String(value).trim();
  if (!text) return 0n;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) {
    // 非常规写法（如 "1,000"、Infinity）无法按十进制串解析，退回浮点换算，同样正负对称
    const scaled = Number(value) * 1e8;
    const units = BigInt(Math.round(Math.abs(scaled)));
    return scaled < 0 ? -units : units;
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] || '0';
  const fraction = match[3] || '';
  const exponent = Number(match[4] || 0);

  // 有效数字串 + 小数点位置：先应用指数再量化，避免"先截断到 8 位小数再乘 10^exponent"
  // 丢掉高位有效数字（例如 1.234567894e+21 会少 4e20 个最小单位）。
  const digits = BigInt(`${whole}${fraction}`);
  const scale = fraction.length - exponent;

  if (scale <= MONEY_SCALE) {
    return sign * (digits * 10n ** BigInt(MONEY_SCALE - scale));
  }

  // 四舍五入到最小单位： (2x + d) / 2d 对整数 x 即半远离零
  const divisor = 10n ** BigInt(scale - MONEY_SCALE);
  return sign * ((digits * 2n + divisor) / (divisor * 2n));
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
