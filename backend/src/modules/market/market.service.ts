// 引入 NestJS 可注入装饰器
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import { DexService } from './dex.service';

const OKX_BASE = 'https://www.okx.com/api/v5';
const BINANCE_BASE = 'https://fapi.binance.com/fapi/v1';
const BINANCE_SPOT_BASE = 'https://api.binance.com/api/v3';
const COINBASE_BASE = 'https://api.exchange.coinbase.com';

/** Coinbase 没有全量 ticker 接口，默认只拉这些主流 USD 交易对。 */
const COINBASE_MAJORS = [
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'XRP-USD',
  'DOGE-USD',
  'ADA-USD',
  'AVAX-USD',
  'LINK-USD',
];

function baseCoinOf(symbol: string): string {
  const value = String(symbol || '').toUpperCase();
  if (value.includes('-')) return value.split('-')[0];
  return value.replace(/(USDT|USDC|USD)$/, '');
}

/** 把任意交易所格式统一成 OKX USDT 永续。 */
function toOkxSymbol(symbol: string): string {
  const value = String(symbol || '').toUpperCase();
  if (value.endsWith('-USDT-SWAP')) return value;
  if (value.endsWith('-USDT')) return `${value}-SWAP`;
  return `${baseCoinOf(value)}-USDT-SWAP`;
}

/** 把任意交易所格式统一成 Binance USDT 永续。 */
function toBinanceSymbol(symbol: string): string {
  const value = String(symbol || '').toUpperCase();
  if (!value.includes('-')) return value;
  return `${baseCoinOf(value)}USDT`;
}

/** 把现货统一格式（BTC-USDT）转成 Binance 现货符号（BTCUSDT）。 */
function toBinanceSpotSymbol(symbol: string): string {
  return `${baseCoinOf(symbol)}USDT`;
}

/** 把任意交易所格式统一成 Coinbase 现货产品。 */
function toCoinbaseProduct(symbol: string): string {
  const value = String(symbol || '').toUpperCase();
  if (value.includes('-') && !value.endsWith('-SWAP')) return value;
  return `${baseCoinOf(value)}-USD`;
}

/** 从 0.001 / 0.00000001 这类精度字符串推算小数位数。 */
function decimalsOf(value: string): number {
  const text = String(value || '');
  const dot = text.indexOf('.');
  return dot >= 0 ? text.length - dot - 1 : 0;
}

const OKX_INTERVAL_MAP: Record<string, string> = {
  '1s': '1s',
  '30s': '30s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
};

/**
 * K 线默认返回根数。
 *
 * 之前固定 200 根，图表向前拖动很快就会撞到空白，用户会以为拖动失效；
 * 这里默认一次拉取 1000 根，并允许调用方通过 limit 调整。
 */
const DEFAULT_KLINE_LIMIT = 1000;
const MAX_KLINE_LIMIT = 1500;
/** OKX /market/candles 单次最多 300 根，超出需要按时间向前翻页。 */
const OKX_KLINE_PAGE_SIZE = 300;
/** Coinbase 蜡烛接口单次最多 300 根。 */
const COINBASE_KLINE_PAGE_SIZE = 300;

interface OkxTicker {
  instId: string;
  last: string;
  bidPx: string;
  askPx: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
}

interface OkxTrade {
  instId: string;
  tradeId: string;
  px: string;
  sz: string;
  side: string;
  ts: string;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  priceChangePercent: string;
  openPrice: string;
}

interface BinanceTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
}

interface BinanceDepth {
  lastUpdateId: number;
  bids: string[][];
  asks: string[][];
}

interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  status: string;
  trading_disabled: boolean;
}

interface CoinbaseStats {
  open: string;
  high: string;
  low: string;
  volume: string;
  last: string;
}

interface CoinbaseBook {
  bids: string[][];
  asks: string[][];
}

interface CoinbaseTrade {
  trade_id: number;
  price: string;
  size: string;
  side: string;
  time: string;
}

type KnownSymbol = {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  maxLeverage: number;
  minQty: string;
  pricePrecision: number;
  qtyPrecision: number;
  /** OKX 用 instCategory=3 标识股票代币，需要与加密货币分开展示。 */
  assetClass?: 'crypto' | 'stock';
};

const SYMBOLS_BY_EXCHANGE: Record<string, KnownSymbol[]> = {
  okx: [],
  binance: [
    { symbol: 'BTCUSDT', baseCoin: 'BTC', quoteCoin: 'USDT', maxLeverage: 125, minQty: '0.001', pricePrecision: 1, qtyPrecision: 3 },
    { symbol: 'ETHUSDT', baseCoin: 'ETH', quoteCoin: 'USDT', maxLeverage: 75, minQty: '0.01', pricePrecision: 2, qtyPrecision: 2 },
    { symbol: 'SOLUSDT', baseCoin: 'SOL', quoteCoin: 'USDT', maxLeverage: 50, minQty: '0.1', pricePrecision: 2, qtyPrecision: 1 },
    { symbol: 'DOGEUSDT', baseCoin: 'DOGE', quoteCoin: 'USDT', maxLeverage: 50, minQty: '10', pricePrecision: 5, qtyPrecision: 0 },
    { symbol: 'XRPUSDT', baseCoin: 'XRP', quoteCoin: 'USDT', maxLeverage: 50, minQty: '1', pricePrecision: 4, qtyPrecision: 0 },
  ],
  uniswap: [
    { symbol: 'ETH-USDT', baseCoin: 'ETH', quoteCoin: 'USDT', maxLeverage: 1, minQty: '0.001', pricePrecision: 2, qtyPrecision: 4 },
    { symbol: 'BTC-USDT', baseCoin: 'BTC', quoteCoin: 'USDT', maxLeverage: 1, minQty: '0.0001', pricePrecision: 2, qtyPrecision: 6 },
    { symbol: 'SOL-USDT', baseCoin: 'SOL', quoteCoin: 'USDT', maxLeverage: 1, minQty: '0.01', pricePrecision: 2, qtyPrecision: 2 },
    { symbol: 'DOGE-USDT', baseCoin: 'DOGE', quoteCoin: 'USDT', maxLeverage: 1, minQty: '10', pricePrecision: 5, qtyPrecision: 0 },
    { symbol: 'XRP-USDT', baseCoin: 'XRP', quoteCoin: 'USDT', maxLeverage: 1, minQty: '1', pricePrecision: 4, qtyPrecision: 0 },
  ],
};

// 行情数据服务，聚合多交易所和多协议数据
@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);
  private coinbaseProductsCache: { at: number; list: CoinbaseProduct[] } | null = null;
  private coinbaseTickerCache = new Map<string, { at: number; value: any }>();
  private binanceSymbolsCache: { at: number; list: KnownSymbol[] } | null = null;
  private binanceSpotSymbolsCache: { at: number; list: KnownSymbol[] } | null = null;
  private okxSymbolsCache: { at: number; list: KnownSymbol[] } | null = null;
  private okxSpotSymbolsCache: { at: number; list: KnownSymbol[] } | null = null;
  private readonly coinbaseAgent = new https.Agent({ keepAlive: true, maxSockets: 2 });
  private readonly binanceAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });

  constructor(
    // 注入去中心化交易所服务
    private readonly dexService: DexService,
  ) {}

  // 通用 OKX API GET 请求封装
  private async getOkx<T>(path: string, params?: Record<string, string>): Promise<{ code: string; data: T[] } | null> {
    try {
      const res = await axios.get<{ code: string; data: T[] }>(`${OKX_BASE}${path}`, {
        params,
        timeout: 8000,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  // 获取 OKX 单条数据（返回第一条）
  private async fetchOkx<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    const body = await this.getOkx<T>(path, params);
    return body && body.code === '0' && body.data?.length ? body.data[0] : null;
  }

  // 获取 OKX 数据列表
  private async fetchOkxList<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const body = await this.getOkx<T>(path, params);
    return body && body.code === '0' ? body.data : [];
  }

  // 通用 Binance API GET 请求封装
  private async getBinance<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    try {
      const res = await axios.get<T>(`${BINANCE_BASE}${path}`, {
        params,
        timeout: 8000,
        httpsAgent: this.binanceAgent,
        proxy: false,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  private async getBinanceSpot<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    try {
      const res = await axios.get<T>(`${BINANCE_SPOT_BASE}${path}`, {
        params,
        timeout: 8000,
        httpsAgent: this.binanceAgent,
        proxy: false,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  // 获取现货交易品种（支持 OKX / Binance / Coinbase）
  async getSpotSymbols(exchange: string = 'okx') {
    if (exchange === 'okx') return this.getOkxSpotSymbols();
    if (exchange === 'binance') return this.getBinanceSpotSymbols();
    if (exchange === 'coinbase') return this.getCoinbaseSymbols();
    return [];
  }

  private async getBinanceSpotSymbols(): Promise<KnownSymbol[]> {
    const now = Date.now();
    if (this.binanceSpotSymbolsCache && now - this.binanceSpotSymbolsCache.at < 60_000) {
      return this.binanceSpotSymbolsCache.list;
    }

    try {
      const res = await axios.get<{ symbols: any[] }>(`${BINANCE_SPOT_BASE}/exchangeInfo`, {
        timeout: 15000,
        httpsAgent: this.binanceAgent,
        proxy: false,
      });
      const raw = res.data?.symbols || [];
      const list = raw
        .filter((item) => item.status === 'TRADING' && item.quoteAsset === 'USDT')
        .map((item) => {
          const filters = item.filters || [];
          const lot = filters.find((filter: any) => filter.filterType === 'LOT_SIZE');
          const priceFilter = filters.find((filter: any) => filter.filterType === 'PRICE_FILTER');
          return {
            symbol: `${item.baseAsset}-USDT`,
            baseCoin: item.baseAsset,
            quoteCoin: 'USDT',
            maxLeverage: 1,
            minQty: lot?.minQty || '0.00000001',
            pricePrecision: decimalsOf(priceFilter?.tickSize || '0.01'),
            qtyPrecision: decimalsOf(lot?.stepSize || '0.00000001'),
            assetClass: 'crypto' as const,
          };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      this.binanceSpotSymbolsCache = { at: now, list };
      return list;
    } catch (error) {
      this.logger.warn(`获取 Binance 现货品种失败: ${(error as Error).message}`);
      return [];
    }
  }

  private async getOkxSpotSymbols(): Promise<KnownSymbol[]> {
    const now = Date.now();
    if (this.okxSpotSymbolsCache && now - this.okxSpotSymbolsCache.at < 60_000) {
      return this.okxSpotSymbolsCache.list;
    }

    try {
      const res = await axios.get<{ code: string; data: any[] }>(`${OKX_BASE}/public/instruments`, {
        params: { instType: 'SPOT' },
        timeout: 15000,
      });
      const instruments = res.data?.data;
      if (res.data?.code !== '0' || !instruments?.length) {
        this.logger.warn(`OKX 现货 instruments 返回空, code=${res.data?.code}`);
        return [];
      }

      const list = instruments
        .filter((inst) => inst.state === 'live' && inst.quoteCcy === 'USDT')
        .map((inst: any) => {
          const tickSz = inst.tickSz || '0.01';
          const lotSz = inst.lotSz || '0.0001';
          return {
            symbol: inst.instId,
            baseCoin: inst.baseCcy || inst.instId.split('-')[0],
            quoteCoin: 'USDT',
            maxLeverage: 1,
            minQty: inst.minSz || lotSz,
            pricePrecision: decimalsOf(tickSz),
            qtyPrecision: decimalsOf(lotSz),
            assetClass: 'crypto' as const,
          };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      this.okxSpotSymbolsCache = { at: now, list };
      return list;
    } catch (error) {
      this.logger.warn(`获取 OKX 现货品种失败: ${(error as Error).message}`);
      return [];
    }
  }

  // 获取现货 ticker
  async getSpotTickers(symbols?: string[], exchange: string = 'okx') {
    if (exchange === 'coinbase') {
      return this.getTickers(symbols, 'coinbase');
    }
    if (exchange === 'binance') {
      return this.getBinanceSpotTickers(symbols);
    }
    if (exchange !== 'okx') return [];

    const requested = symbols?.length ? new Set(symbols.map((symbol) => symbol.toUpperCase())) : null;
    const raw = await this.fetchOkxList<OkxTicker>('/market/tickers', { instType: 'SPOT' });
    return raw
      .filter((ticker) => {
        const symbol = String(ticker.instId || '').toUpperCase();
        if (!symbol.endsWith('-USDT')) return false;
        return !requested || requested.has(symbol);
      })
      .map((ticker) => {
        const last = Number(ticker.last) || 0;
        const open = Number(ticker.open24h) || 0;
        const change = open > 0 ? ((last - open) / open) * 100 : 0;
        return {
          symbol: ticker.instId,
          lastPrice: ticker.last,
          markPrice: ticker.last,
          indexPrice: ticker.last,
          bidPrice: ticker.bidPx,
          askPrice: ticker.askPx,
          high24h: ticker.high24h,
          low24h: ticker.low24h,
          volume24h: ticker.vol24h,
          priceChangePercent24h: change.toFixed(2),
          assetClass: 'crypto' as const,
        };
      });
  }

  private async getBinanceSpotTickers(symbols?: string[]) {
    const requested = symbols?.length
      ? new Set(symbols.map((symbol) => toBinanceSpotSymbol(symbol)))
      : null;

    try {
      const res = await axios.get<any[]>(`${BINANCE_SPOT_BASE}/ticker/24hr`, {
        timeout: 12000,
        httpsAgent: this.binanceAgent,
        proxy: false,
      });
      return (res.data || [])
        .filter((ticker) => String(ticker.symbol || '').endsWith('USDT'))
        .filter((ticker) => !requested || requested.has(String(ticker.symbol).toUpperCase()))
        .map((ticker) => {
          const rawSymbol = String(ticker.symbol || '').toUpperCase();
          const base = rawSymbol.slice(0, -4);
          return {
            symbol: `${base}-USDT`,
            lastPrice: ticker.lastPrice,
            markPrice: ticker.lastPrice,
            indexPrice: ticker.lastPrice,
            bidPrice: ticker.bidPrice,
            askPrice: ticker.askPrice,
            high24h: ticker.highPrice,
            low24h: ticker.lowPrice,
            volume24h: ticker.volume,
            priceChangePercent24h: ticker.priceChangePercent,
            assetClass: 'crypto' as const,
          };
        });
    } catch (error) {
      this.logger.warn(`获取 Binance 现货 ticker 失败: ${(error as Error).message}`);
      return [];
    }
  }

  // 获取现货 K 线（OKX / Binance / Coinbase）
  async getSpotKlines(symbol: string, interval: string, exchange: string = 'okx', limit = DEFAULT_KLINE_LIMIT) {
    const safeLimit = this.clampKlineLimit(limit);
    if (exchange === 'coinbase') {
      return this.getKlines(symbol, interval, 'coinbase', safeLimit);
    }
    if (exchange === 'binance') {
      return this.getBinanceSpotKlines(symbol, interval, safeLimit);
    }
    if (exchange !== 'okx') return [];
    return this.getOkxCandles(String(symbol).toUpperCase(), interval, safeLimit);
  }

  // 获取指定交易所支持的交易品种列表
  async getSymbols(exchange: string = 'okx') {
    if (exchange === 'okx') {
      return this.getOkxSymbols();
    }
    if (exchange === 'coinbase') {
      return this.getCoinbaseSymbols();
    }
    if (exchange === 'binance') {
      return this.getBinanceSymbols();
    }
    return SYMBOLS_BY_EXCHANGE[exchange] || SYMBOLS_BY_EXCHANGE['okx'];
  }

  private async getOkxSymbols(): Promise<KnownSymbol[]> {
    const now = Date.now();
    if (this.okxSymbolsCache && now - this.okxSymbolsCache.at < 60_000) {
      return this.okxSymbolsCache.list;
    }

    try {
      const res = await axios.get<{ code: string; data: any[] }>(`${OKX_BASE}/public/instruments`, {
        params: { instType: 'SWAP' },
        timeout: 15000,
      });

      const instruments = res.data?.data;
      if (res.data?.code !== '0' || !instruments?.length) {
        this.logger.warn(`OKX instruments 返回空, code=${res.data?.code}`);
        return [];
      }

      const list = instruments
        .filter((inst) => inst.ctType === 'linear' && inst.instId.endsWith('-USDT-SWAP'))
        .map((inst: any) => {
          const base = inst.uly?.replace('-USDT', '') || inst.instId.split('-')[0];
          const tickSz = inst.tickSz || '0.01';
          const lotSz = inst.lotSz || '0.001';
          return {
            symbol: inst.instId,
            baseCoin: base,
            quoteCoin: 'USDT',
            maxLeverage: Number(inst.lever) || 10,
            minQty: inst.minSz || lotSz,
            pricePrecision: tickSz.includes('.') ? tickSz.split('.')[1].length : 0,
            qtyPrecision: lotSz.includes('.') ? lotSz.split('.')[1].length : 0,
            // OKX 用 instCategory=3 标识股票代币。
            assetClass: inst.instCategory === '3' ? ('stock' as const) : ('crypto' as const),
          };
        })
        .filter((s) => s.symbol.endsWith('-USDT-SWAP'));

      const stockCount = list.filter((item) => item.assetClass === 'stock').length;
      this.logger.log(`OKX instruments 加载 ${list.length} 个合约（股票代币 ${stockCount} 个）`);
      this.okxSymbolsCache = { at: now, list };
      return list;
    } catch (err) {
      this.logger.error(`获取 OKX instruments 失败: ${(err as Error).message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------- Coinbase

  private async getCoinbaseProducts(): Promise<CoinbaseProduct[]> {
    const now = Date.now();
    if (this.coinbaseProductsCache && now - this.coinbaseProductsCache.at < 60_000) {
      return this.coinbaseProductsCache.list;
    }

    try {
      const res = await axios.get<CoinbaseProduct[]>(`${COINBASE_BASE}/products`, {
        timeout: 12000,
        httpsAgent: this.coinbaseAgent,
        proxy: false,
      });
      const list = (res.data || []).filter(
        (product) =>
          product.status === 'online' &&
          !product.trading_disabled &&
          ['USD', 'USDT', 'USDC'].includes(product.quote_currency),
      );
      this.coinbaseProductsCache = { at: now, list };
      return list;
    } catch (error) {
      this.logger.warn(`获取 Coinbase products 失败: ${(error as Error).message}`);
      return [];
    }
  }

  private async getCoinbaseSymbols(): Promise<KnownSymbol[]> {
    const products = await this.getCoinbaseProducts();
    if (!products.length) {
      return COINBASE_MAJORS.map((symbol) => ({
        symbol,
        baseCoin: symbol.split('-')[0],
        quoteCoin: symbol.split('-')[1] || 'USD',
        maxLeverage: 1,
        minQty: '0.00000001',
        pricePrecision: 8,
        qtyPrecision: 8,
      }));
    }

    // Coinbase 没有全量 ticker 接口；只保留能稳定拉到行情的 USD 主流对。
    const byId = new Map(products.map((product) => [product.id, product]));
    return COINBASE_MAJORS.map((id) => byId.get(id))
      .filter((product): product is CoinbaseProduct => Boolean(product))
      .map((product) => ({
        symbol: product.id,
        baseCoin: product.base_currency,
        quoteCoin: product.quote_currency,
        maxLeverage: 1,
        minQty: '0.00000001',
        pricePrecision: 8,
        qtyPrecision: 8,
      }));
  }

  private async getCoinbaseTickers(symbols?: string[]) {
    const requested = Array.from(
      new Set((symbols?.length ? symbols.map(toCoinbaseProduct) : COINBASE_MAJORS).filter(Boolean)),
    ).slice(0, 30);

    const results: any[] = [];
    for (let index = 0; index < requested.length; index += 1) {
      const productId = requested[index];
      const now = Date.now();
      const cached = this.coinbaseTickerCache.get(productId);
      if (cached && now - cached.at < 15_000) {
        results.push(cached.value);
        continue;
      }

      let stats: CoinbaseStats | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await axios.get<CoinbaseStats>(`${COINBASE_BASE}/products/${productId}/stats`, {
            timeout: 8000,
            httpsAgent: this.coinbaseAgent,
            proxy: false,
          });
          stats = res.data;
          break;
        } catch (error) {
          if (attempt === 1) {
            this.logger.warn(`获取 Coinbase ${productId} 行情失败: ${(error as Error).message}`);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
        }
      }

      if (!stats) continue;
      const last = Number(stats.last);
      if (!Number.isFinite(last) || last <= 0) continue;

      const open = Number(stats.open) || last;
      const changePct = open ? (((last - open) / open) * 100).toFixed(2) : '0.00';
      const ticker = {
        symbol: productId,
        lastPrice: String(last),
        markPrice: String(last),
        indexPrice: String(last),
        bidPrice: String(last),
        askPrice: String(last),
        high24h: String(Number(stats.high) || last),
        low24h: String(Number(stats.low) || last),
        volume24h: String(Number(stats.volume) || 0),
        priceChangePercent24h: changePct,
        assetClass: 'crypto',
      };
      this.coinbaseTickerCache.set(productId, { at: now, value: ticker });
      results.push(ticker);

      // Coinbase 对并发 TLS 连接比较敏感，串行拉取并留一点间隔。
      if (index < requested.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    return results;
  }

  // 获取行情 ticker 数据，支持多交易所
  async getTickers(symbols?: string[], exchange: string = 'okx') {
    switch (exchange) {
      case 'binance':    return this.getBinanceTickers(symbols);
      case 'coinbase':   return this.getCoinbaseTickers(symbols);
      case 'uniswap':    return this.dexService.getTickers(symbols);
      default:           return this.getOkxTickers(symbols);
    }
  }

  // 获取 OKX 交易所 ticker 数据
  private async getOkxTickers(symbols?: string[]) {
    // 获取所有 SWAP 合约 ticker
    const all = await this.fetchOkxList<OkxTicker>('/market/tickers', { instType: 'SWAP' });
    // 如果指定了交易对则过滤（允许前端传 Binance/Coinbase 格式）
    const requested = symbols?.map(toOkxSymbol);
    const tickers = requested?.length
      ? all.filter((t) => requested.includes(t.instId))
      : all;

    if (!tickers.length) return [];

    const okxSymbols = await this.getOkxSymbols();
    const stockSet = new Set(
      okxSymbols.filter((item) => item.assetClass === 'stock').map((item) => item.symbol),
    );

    // 映射为标准 ticker 格式
    return tickers.map((t) => {
      const last = t.last || '0';
      const open = t.open24h || last;
      const change = Number(last) - Number(open);
      const changePct = Number(open) ? ((change / Number(open)) * 100).toFixed(2) : '0.00';

      return {
        symbol: t.instId,
        lastPrice: last,
        markPrice: last,
        indexPrice: last,
        bidPrice: t.bidPx,
        askPrice: t.askPx,
        high24h: t.high24h,
        low24h: t.low24h,
        volume24h: t.vol24h,
        priceChangePercent24h: changePct,
        assetClass: stockSet.has(t.instId) ? 'stock' : 'crypto',
      };
    });
  }

  // 获取 Binance USDT 永续合约列表
  private async getBinanceSymbols(): Promise<KnownSymbol[]> {
    const now = Date.now();
    if (this.binanceSymbolsCache && now - this.binanceSymbolsCache.at < 60_000) {
      return this.binanceSymbolsCache.list;
    }

    try {
      let response: { symbols: any[] } | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const res = await axios.get<{ symbols: any[] }>(`${BINANCE_BASE}/exchangeInfo`, {
            timeout: 15000,
            httpsAgent: this.binanceAgent,
            proxy: false,
          });
          response = res.data;
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      const list = (response?.symbols || [])
        .filter(
          (symbol) =>
            symbol.contractType === 'PERPETUAL' &&
            symbol.quoteAsset === 'USDT' &&
            symbol.status === 'TRADING',
        )
        .map((symbol) => {
          const lotSize = (symbol.filters || []).find((filter: any) => filter.filterType === 'LOT_SIZE');
          return {
            symbol: symbol.symbol,
            baseCoin: symbol.baseAsset,
            quoteCoin: symbol.quoteAsset,
            maxLeverage: 50,
            minQty: lotSize?.minQty || '0.001',
            pricePrecision: Number(symbol.pricePrecision ?? 2),
            qtyPrecision: Number(symbol.quantityPrecision ?? 3),
          };
        });
      this.binanceSymbolsCache = { at: now, list };
      return list;
    } catch (error) {
      this.logger.warn(`获取 Binance exchangeInfo 失败: ${(error as Error).message}`);
      return SYMBOLS_BY_EXCHANGE['binance'];
    }
  }

  // 获取 Binance 交易所 ticker 数据
  private async getBinanceTickers(symbols?: string[]) {
    // 获取 24 小时 ticker 列表
    const all = await this.getBinance<BinanceTicker[]>('/ticker/24hr');
    if (!all) return [];

    const requested = symbols?.map(toBinanceSymbol);
    const filtered = requested?.length
      ? all.filter((t) => requested.includes(t.symbol))
      : all.filter((t) => t.symbol.endsWith('USDT'));

    if (!filtered.length) return [];

    return filtered.map((t) => ({
      symbol: t.symbol,
      lastPrice: t.lastPrice || '0',
      markPrice: t.lastPrice || '0',
      indexPrice: t.lastPrice || '0',
      bidPrice: t.bidPrice,
      askPrice: t.askPrice,
      high24h: t.highPrice,
      low24h: t.lowPrice,
      volume24h: t.volume,
      priceChangePercent24h: t.priceChangePercent,
      assetClass: 'crypto',
    }));
  }

  // 获取 K 线数据，支持多交易所
  async getKlines(
    symbol: string,
    interval: string,
    exchange: string = 'okx',
    limit?: number,
  ) {
    const safeLimit = this.clampKlineLimit(limit);
    if (exchange === 'okx') {
      return this.getOkxKlines(symbol, interval, safeLimit);
    }
    if (exchange === 'binance') {
      return this.getBinanceKlines(symbol, interval, safeLimit);
    }
    if (exchange === 'coinbase') {
      return this.getCoinbaseKlines(symbol, interval, safeLimit);
    }
    return this.dexService.getKlines(symbol, interval);
  }

  // 限制单次 K 线根数，避免异常参数拖垮上游接口
  private clampKlineLimit(limit?: number): number {
    if (limit === undefined || limit === null) return DEFAULT_KLINE_LIMIT;
    const parsed = Math.trunc(Number(limit));
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_KLINE_LIMIT;
    return Math.min(Math.max(parsed, 1), MAX_KLINE_LIMIT);
  }

  // 获取 OKX K 线数据：单次最多 300 根，按 after 向更早翻页
  private async getOkxKlines(symbol: string, interval: string, limit: number) {
    return this.getOkxCandles(toOkxSymbol(symbol), interval, limit);
  }

  private async getOkxCandles(instId: string, interval: string, limit: number) {
    const bar = OKX_INTERVAL_MAP[interval] || interval;
    const collected = new Map<number, string[]>();
    let after: string | undefined;
    let previousOldest = Number.POSITIVE_INFINITY;

    while (collected.size < limit) {
      const pageLimit = Math.min(OKX_KLINE_PAGE_SIZE, limit - collected.size);
      const params: Record<string, string> = {
        instId,
        bar,
        limit: String(pageLimit),
      };
      if (after) params.after = after;

      const raw = await this.fetchOkxList<string[]>('/market/candles', params);
      if (!raw.length) break;

      let oldest = Number.POSITIVE_INFINITY;
      for (const candle of raw) {
        const openTime = Number(candle[0]);
        if (!Number.isFinite(openTime)) continue;
        collected.set(openTime, candle);
        oldest = Math.min(oldest, openTime);
      }

      // 本页没有带来更早的数据时停止，避免上游忽略 after 造成死循环
      if (!Number.isFinite(oldest) || oldest >= previousOldest) break;
      previousOldest = oldest;
      after = String(oldest);
    }

    return Array.from(collected.values())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .slice(0, limit)
      .map((c) => ({
        openTime: Number(c[0]),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }));
  }

  // 获取 Binance K 线数据
  private async getBinanceKlines(symbol: string, interval: string, limit: number) {
    const raw = await this.getBinance<string[][]>('/klines', {
      symbol: toBinanceSymbol(symbol),
      interval,
      limit,
    });
    if (!raw) return [];

    // Binance 返回由旧到新；统一成 OKX 的由新到旧。
    return raw
      .map((c) => ({
        openTime: Number(c[0]),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }))
      .sort((a, b) => b.openTime - a.openTime);
  }

  private async getBinanceSpotKlines(symbol: string, interval: string, limit: number) {
    const raw = await this.getBinanceSpot<string[][]>('/klines', {
      symbol: toBinanceSpotSymbol(symbol),
      interval,
      limit,
    });
    if (!raw) return [];

    return raw
      .map((c) => ({
        openTime: Number(c[0]),
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }))
      .sort((a, b) => b.openTime - a.openTime);
  }

  // 获取 Coinbase K 线数据：按时间窗口向前翻页，再按需要聚合
  private async getCoinbaseKlines(symbol: string, interval: string, limit: number) {
    const productId = toCoinbaseProduct(symbol);
    const config: Record<string, { granularity: number; factor: number }> = {
      '1m': { granularity: 60, factor: 1 },
      '5m': { granularity: 300, factor: 1 },
      '15m': { granularity: 900, factor: 1 },
      '30m': { granularity: 900, factor: 2 },
      '1h': { granularity: 3600, factor: 1 },
      '4h': { granularity: 3600, factor: 4 },
      '1d': { granularity: 86400, factor: 1 },
    };
    const target = config[interval];
    // Coinbase 不支持秒级 K 线。
    if (!target) return [];

    type CoinbaseCandleRow = {
      openTime: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };

    const collected = new Map<number, CoinbaseCandleRow>();
    // factor > 1 需要用更细周期的蜡烛聚合，因此按目标根数 * factor 拉取原始蜡烛。
    const rawTarget = Math.min(limit * target.factor, MAX_KLINE_LIMIT);
    let cursorEnd = Math.floor(Date.now() / 1000);

    while (collected.size < rawTarget) {
      const start = cursorEnd - target.granularity * (COINBASE_KLINE_PAGE_SIZE - 1);
      if (start <= 0) break;

      try {
        const res = await axios.get<number[][]>(`${COINBASE_BASE}/products/${productId}/candles`, {
          params: { granularity: target.granularity, start, end: cursorEnd },
          timeout: 10000,
          httpsAgent: this.coinbaseAgent,
          proxy: false,
        });
        const rows = (res.data || []).slice().sort((a, b) => a[0] - b[0]);
        if (!rows.length) break;

        let earliest = Number.POSITIVE_INFINITY;
        for (const c of rows) {
          const openTime = Number(c[0]) * 1000;
          if (!Number.isFinite(openTime)) continue;
          collected.set(openTime, {
            openTime,
            low: c[1],
            high: c[2],
            open: c[3],
            close: c[4],
            volume: c[5],
          });
          earliest = Math.min(earliest, Number(c[0]));
        }

        if (!Number.isFinite(earliest) || earliest >= cursorEnd) break;
        cursorEnd = earliest - 1;
      } catch (error) {
        this.logger.warn(`获取 Coinbase ${productId} K 线失败: ${(error as Error).message}`);
        // 已经拿到部分历史时继续返回，避免一次失败把整张图清空。
        if (!collected.size) return [];
        break;
      }
    }

    if (!collected.size) return [];

    const candles = Array.from(collected.values()).sort((a, b) => a.openTime - b.openTime);
    const aggregated: CoinbaseCandleRow[] = [];
    if (target.factor <= 1) {
      aggregated.push(...candles);
    } else {
      const bucketMs = target.granularity * 1000 * target.factor;
      const groups = new Map<number, CoinbaseCandleRow[]>();
      for (const candle of candles) {
        const bucket = Math.floor(candle.openTime / bucketMs) * bucketMs;
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket)!.push(candle);
      }
      for (const [bucket, group] of groups) {
        aggregated.push({
          openTime: bucket,
          open: group[0].open,
          high: Math.max(...group.map((c) => Number(c.high))),
          low: Math.min(...group.map((c) => Number(c.low))),
          close: group[group.length - 1].close,
          volume: group.reduce((sum, c) => sum + Number(c.volume), 0),
        });
      }
    }

    // 统一成由新到旧，最多返回 limit 根。
    return aggregated
      .sort((a, b) => a.openTime - b.openTime)
      .reverse()
      .slice(0, limit)
      .map((c) => ({
        openTime: c.openTime,
        open: String(c.open),
        high: String(c.high),
        low: String(c.low),
        close: String(c.close),
        volume: String(c.volume),
      }));
  }

  // 获取深度数据，支持多交易所
  async getDepth(symbol: string, limit = 20, exchange: string = 'okx') {
    switch (exchange) {
      case 'binance':    return this.getBinanceDepth(symbol, limit);
      case 'coinbase':   return this.getCoinbaseDepth(symbol, limit);
      case 'uniswap':    return this.dexService.getDepth(symbol);
    }
    return this.getOkxDepth(symbol, limit);
  }

  // 获取 OKX 深度数据
  private async getOkxDepth(symbol: string, limit: number) {
    const instId = toOkxSymbol(symbol);
    const raw = await this.fetchOkx<{ asks: string[]; bids: string[] }>(
      '/market/books',
      { instId, sz: String(limit) },
    );
    if (!raw) return null;

    return {
      symbol: instId,
      bids: (raw.bids as unknown as string[][]).map((l) => [l[0], l[1]] as [string, string]),
      asks: (raw.asks as unknown as string[][]).map((l) => [l[0], l[1]] as [string, string]),
    };
  }

  // 获取 Binance 深度数据
  private async getBinanceDepth(symbol: string, limit: number) {
    const binanceSymbol = toBinanceSymbol(symbol);
    const raw = await this.getBinance<BinanceDepth>('/depth', { symbol: binanceSymbol, limit });
    if (!raw) return null;

    return {
      symbol: binanceSymbol,
      bids: raw.bids.map((l) => [l[0], l[1]] as [string, string]),
      asks: raw.asks.map((l) => [l[0], l[1]] as [string, string]),
    };
  }

  // 获取 Coinbase 深度数据
  private async getCoinbaseDepth(symbol: string, limit: number) {
    const productId = toCoinbaseProduct(symbol);
    try {
      const res = await axios.get<CoinbaseBook>(`${COINBASE_BASE}/products/${productId}/book`, {
        params: { level: 2 },
        timeout: 10000,
        httpsAgent: this.coinbaseAgent,
        proxy: false,
      });
      const book = res.data;
      return {
        symbol: productId,
        bids: (book.bids || []).slice(0, limit).map((l) => [l[0], l[1]] as [string, string]),
        asks: (book.asks || []).slice(0, limit).map((l) => [l[0], l[1]] as [string, string]),
      };
    } catch (error) {
      this.logger.warn(`获取 Coinbase ${productId} 盘口失败: ${(error as Error).message}`);
      return null;
    }
  }

  // 获取成交数据，支持多交易所
  async getTrades(symbol: string, exchange: string = 'okx') {
    if (exchange === 'uniswap') {
      return this.dexService.getTrades(symbol);
    }
    if (exchange === 'binance') {
      return this.getBinanceTrades(symbol);
    }
    if (exchange === 'coinbase') {
      return this.getCoinbaseTrades(symbol);
    }
    return this.getOkxTrades(symbol);
  }

  // 获取 OKX 成交数据
  private async getOkxTrades(symbol: string) {
    const trades = await this.fetchOkxList<OkxTrade>('/market/trades', {
      instId: toOkxSymbol(symbol),
      limit: '50',
    });
    if (!trades.length) return [];

    return trades.map((t) => ({
      price: t.px,
      qty: t.sz,
      side: t.side as 'buy' | 'sell',
      ts: Number(t.ts),
    }));
  }

  // 获取 Binance 成交数据
  private async getBinanceTrades(symbol: string) {
    const binanceSymbol = toBinanceSymbol(symbol);
    const trades = await this.getBinance<BinanceTrade[]>('/trades', { symbol: binanceSymbol, limit: 50 });
    if (!trades) return [];

    return trades.map((t) => ({
      price: t.price,
      qty: t.qty,
      side: t.isBuyerMaker ? 'sell' : 'buy' as 'buy' | 'sell',
      ts: t.time,
    }));
  }

  // 获取 Coinbase 成交数据
  private async getCoinbaseTrades(symbol: string) {
    const productId = toCoinbaseProduct(symbol);
    try {
      const res = await axios.get<CoinbaseTrade[]>(`${COINBASE_BASE}/products/${productId}/trades`, {
        params: { limit: 50 },
        timeout: 10000,
        httpsAgent: this.coinbaseAgent,
        proxy: false,
      });
      return (res.data || []).map((trade) => ({
        price: trade.price,
        qty: trade.size,
        side: trade.side === 'sell' ? 'sell' : ('buy' as 'buy' | 'sell'),
        ts: Date.parse(trade.time),
      }));
    } catch (error) {
      this.logger.warn(`获取 Coinbase ${productId} 成交失败: ${(error as Error).message}`);
      return [];
    }
  }
}
