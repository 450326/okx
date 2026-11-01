export type RiskLevel = 'safe' | 'watch' | 'warning' | 'danger' | 'unknown';

/**
 * 统一风险色阶：
 * >30% 安全，15%~30% 关注，5%~15% 警告，<5% 危险。
 * 这里的百分比是“强平价距当前价的距离”。
 */
export function riskLevelFromDistance(distance: number | null | undefined): RiskLevel {
  if (distance == null || !Number.isFinite(distance)) return 'unknown';
  if (distance > 30) return 'safe';
  if (distance > 15) return 'watch';
  if (distance >= 5) return 'warning';
  return 'danger';
}

export function liquidationDistance(
  liquidationPrice: string | number | null | undefined,
  markPrice: string | number | null | undefined,
  side: 'long' | 'short',
): number | null {
  const liq = Number(liquidationPrice);
  const mark = Number(markPrice);
  if (!Number.isFinite(liq) || !Number.isFinite(mark) || liq <= 0 || mark <= 0) return null;
  const distance = side === 'long' ? ((mark - liq) / mark) * 100 : ((liq - mark) / mark) * 100;
  return Math.max(0, distance);
}

export function riskLevelKey(level: RiskLevel): string {
  return `risk.${level}`;
}

export function riskClass(level: RiskLevel): string {
  return `risk-${level}`;
}

export function riskLevelFromPosition(item: {
  liquidationPrice: string | number;
  markPrice: string | number;
  side: 'long' | 'short';
}): RiskLevel {
  return riskLevelFromDistance(liquidationDistance(item.liquidationPrice, item.markPrice, item.side));
}

export function estimateMakerFee(preview: {
  estimatedFee?: string;
  estimatedNotional?: string;
} | null): number {
  const notional = Number(preview?.estimatedNotional);
  if (!Number.isFinite(notional) || notional <= 0) return 0;
  // OKX 永续默认 Maker 0.02%；服务端当前只返回一笔预估手续费，Maker 作为展示估算。
  return notional * 0.0002;
}

export function estimateTakerFee(preview: {
  estimatedFee?: string;
} | null): number {
  const fee = Number(preview?.estimatedFee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}
