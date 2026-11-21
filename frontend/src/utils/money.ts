/**
 * 前端金额换算，与 backend/src/common/money.ts 使用同一套规则：
 * 1e-8 最小单位、指数先移位再量化、四舍五入且正负对称。
 *
 * 组件里不要再用 `Number(qty) * price` 直接算金额——二进制浮点误差会让
 * “余额够不够”的判断随输入抖动，只能靠 `+0.000001` 这类拍脑袋容差兜底。
 */
export const MONEY_SCALE = 8;
export const MONEY_UNIT = 10n ** 8n;

export function toUnits(value: number | string | null | undefined): bigint {
  if (value == null || value === '') return 0n;
  const text = String(value).trim();
  if (!text) return 0n;
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) {
    const scaled = Number(value) * 1e8;
    if (!Number.isFinite(scaled)) return 0n;
    const units = BigInt(Math.round(Math.abs(scaled)));
    return scaled < 0 ? -units : units;
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = match[2] || '0';
  const fraction = match[3] || '';
  const exponent = Number(match[4] || 0);

  const digits = BigInt(`${whole}${fraction}`);
  const scale = fraction.length - exponent;

  if (scale <= MONEY_SCALE) {
    return sign * (digits * 10n ** BigInt(MONEY_SCALE - scale));
  }

  const divisor = 10n ** BigInt(scale - MONEY_SCALE);
  return sign * ((digits * 2n + divisor) / (divisor * 2n));
}

export function fromUnits(units: bigint): number {
  return Number(units) / 1e8;
}

/** 最小单位 × 最小单位 → 最小单位（向下取整），用于 数量 × 价格 */
export function mulUnits(a: bigint, b: bigint): bigint {
  return (a * b) / MONEY_UNIT;
}

/** 最小单位 ÷ 最小单位 → 纯比例（向下取整），不会溢出为浮点 */
export function divUnits(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  return (a * MONEY_UNIT) / b;
}

/** 按基点（1/10000）取最小单位，向下取整，例如手续费 5bps */
export function bpsUnits(units: bigint, basisPoints: number): bigint {
  return (units * BigInt(Math.round(basisPoints))) / 10000n;
}
