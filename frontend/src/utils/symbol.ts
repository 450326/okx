export type ExchangeId = 'okx' | 'binance' | 'coinbase' | 'uniswap';

/** 从任意交易所格式中取基础币：BTC-USDT-SWAP / BTCUSDT / BTC-USD -> BTC */
export function extractBase(symbol?: string): string {
  const value = String(symbol || '').toUpperCase();
  if (!value) return '';
  if (value.includes('-')) return value.split('-')[0];
  return value.replace(/(USDT|USDC|USD)$/, '');
}

/** 把交易对转换为目标交易所的原生格式。 */
export function toExchangeSymbol(symbol: string | undefined, exchange: ExchangeId): string {
  const raw = String(symbol || 'BTC-USDT-SWAP').toUpperCase();
  const base = extractBase(raw) || 'BTC';
  if (exchange === 'okx') return `${base}-USDT-SWAP`;
  if (exchange === 'binance') return `${base}USDT`;
  if (exchange === 'coinbase') return `${base}-USD`;
  return `${base}-USDT`;
}

/** 判断一个 symbol 是否属于目标交易所，避免切换时短暂显示上一家交易所的行情。 */
export function isSymbolForExchange(symbol: string | undefined, exchange: ExchangeId): boolean {
  const value = String(symbol || '').toUpperCase();
  if (!value) return false;
  if (exchange === 'okx') return value.endsWith('-USDT-SWAP');
  if (exchange === 'binance') return !value.includes('-') && value.endsWith('USDT');
  if (exchange === 'coinbase') return value.endsWith('-USD') || value.endsWith('-USDC');
  if (exchange === 'uniswap') return value.endsWith('-USDT');
  return true;
}

/** 交易对展示用：返回基础币和计价币。 */
export function splitMarketSymbol(symbol?: string): { base: string; quote: string } {
  const value = String(symbol || '').toUpperCase();
  if (value.includes('-')) {
    const [base, quote] = value.split('-');
    return { base, quote: quote || 'USDT' };
  }
  const base = value.replace(/(USDT|USDC|USD)$/, '');
  const quote = value.slice(base.length) || 'USDT';
  return { base, quote };
}
