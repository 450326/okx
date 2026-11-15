import { useCurrencyStore } from '../stores/currency';
import { $t } from './i18n';

const ORDER_STATUS_KEYS: Record<string, string> = {
  pending: 'orderStatus.pending',
  filled: 'orderStatus.filled',
  cancelled: 'orderStatus.cancelled',
  canceled: 'orderStatus.cancelled',
  rejected: 'orderStatus.rejected',
  partially_filled: 'orderStatus.partially_filled',
  open: 'orderStatus.open',
  closed: 'orderStatus.closed',
  liquidated: 'orderStatus.liquidated',
};

// 把后端内部状态（filled/cancelled...）转换成界面语言
export function formatOrderStatus(status?: string): string {
  const key = status ? ORDER_STATUS_KEYS[status.toLowerCase()] : '';
  return key ? $t(key) : (status || '--');
}

// 把 ord_1005 / pord_1001 这类内部编号显示成交易所风格的长订单号
export function formatOrderId(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '--';
  if (/^\d{12,}$/.test(raw)) return raw;

  const match = raw.match(/(\d+)/);
  if (!match) return raw;

  try {
    const seq = BigInt(match[1]);
    return (100000000000000000n + seq * 1000003n).toString();
  } catch {
    return raw;
  }
}

const LEDGER_TYPE_KEYS: Record<string, string> = {
  deposit: 'ledgerType.deposit',
  open_fee: 'ledgerType.openFee',
  close_fee: 'ledgerType.closeFee',
  realized_pnl: 'ledgerType.realizedPnl',
  liquidation: 'ledgerType.liquidation',
  prediction_buy: 'ledgerType.predictionBuy',
  prediction_sell: 'ledgerType.predictionSell',
  spot_buy: 'ledgerType.spotBuy',
  spot_sell: 'ledgerType.spotSell',
  funding_fee: 'ledgerType.fundingFee',
  reset: 'ledgerType.reset',
};

// 资金流水类型（open_fee/prediction_buy...）转成界面语言
export function formatLedgerType(type?: string): string {
  const key = type ? LEDGER_TYPE_KEYS[type.toLowerCase()] : '';
  return key ? $t(key) : (type || '--');
}

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
  const prefix = numeric >= 0 ? '+' : '-';
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
