import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { DexService } from './dex.service';
import { PolymarketService } from './polymarket.service';

const OKX_BASE = 'https://www.okx.com/api/v5';
const BINANCE_BASE = 'https://fapi.binance.com/fapi/v1';

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

type KnownSymbol = {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  maxLeverage: number;
  minQty: string;
  pricePrecision: number;
  qtyPrecision: number;
};

const SYMBOLS_BY_EXCHANGE: Record<string, KnownSymbol[]> = {
  okx: [
    { symbol: 'BTC-USDT-SWAP', baseCoin: 'BTC', quoteCoin: 'USDT', maxLeverage: 50, minQty: '0.001', pricePrecision: 1, qtyPrecision: 3 },
    { symbol: 'ETH-USDT-SWAP', baseCoin: 'ETH', quoteCoin: 'USDT', maxLeverage: 50, minQty: '0.01', pricePrecision: 2, qtyPrecision: 2 },
    { symbol: 'SOL-USDT-SWAP', baseCoin: 'SOL', quoteCoin: 'USDT', maxLeverage: 25, minQty: '0.1', pricePrecision: 2, qtyPrecision: 1 },
    { symbol: 'DOGE-USDT-SWAP', baseCoin: 'DOGE', quoteCoin: 'USDT', maxLeverage: 25, minQty: '10', pricePrecision: 5, qtyPrecision: 0 },
    { symbol: 'XRP-USDT-SWAP', baseCoin: 'XRP', quoteCoin: 'USDT', maxLeverage: 25, minQty: '1', pricePrecision: 4, qtyPrecision: 0 },
  ],
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
  polymarket: [
    { symbol: 'BTC-150K-DEC2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'ETH-5K-DEC2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'SOL-500-DEC2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'BTC-110K-JUN28', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'ETH-4K-JUN28', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'FED-CUT-OCT2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'BTC-200K-DEC2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
    { symbol: 'SPX-7000-DEC2026', baseCoin: 'YES', quoteCoin: 'USDC', maxLeverage: 1, minQty: '1', pricePrecision: 3, qtyPrecision: 0 },
  ],
};

@Injectable()
export class MarketService {
  constructor(
    private readonly dexService: DexService,
    private readonly polymarketService: PolymarketService,
  ) {}

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

  private async fetchOkx<T>(path: string, params?: Record<string, string>): Promise<T | null> {
    const body = await this.getOkx<T>(path, params);
    return body && body.code === '0' && body.data?.length ? body.data[0] : null;
  }

  private async fetchOkxList<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const body = await this.getOkx<T>(path, params);
    return body && body.code === '0' ? body.data : [];
  }

  private async getBinance<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
    try {
      const res = await axios.get<T>(`${BINANCE_BASE}${path}`, {
        params,
        timeout: 8000,
      });
      return res.data;
    } catch {
      return null;
    }
  }

  async getSymbols(exchange: string = 'okx') {
    if (exchange === 'polymarket') {
      return this.polymarketService.getSymbols();
    }
    return SYMBOLS_BY_EXCHANGE[exchange] || SYMBOLS_BY_EXCHANGE['okx'];
  }

  async getTickers(symbols?: string[], exchange: string = 'okx') {
    switch (exchange) {
      case 'polymarket': return this.polymarketService.getTickers(symbols);
      case 'binance':    return this.getBinanceTickers(symbols);
      case 'uniswap':    return this.dexService.getTickers(symbols);
      default:           return this.getOkxTickers(symbols);
    }
  }

  private async getOkxTickers(symbols?: string[]) {
    const all = await this.fetchOkxList<OkxTicker>('/market/tickers', { instType: 'SWAP' });
    const tickers = symbols?.length
      ? all.filter((t) => symbols.includes(t.instId))
      : all;

    if (!tickers.length) return [];

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
      };
    });
  }

  private async getBinanceTickers(symbols?: string[]) {
    const all = await this.getBinance<BinanceTicker[]>('/ticker/24hr');
    if (!all) return [];

    const knownSymbols = SYMBOLS_BY_EXCHANGE['binance'].map((s) => s.symbol);
    const filtered = symbols?.length
      ? all.filter((t) => symbols.includes(t.symbol))
      : all.filter((t) => knownSymbols.includes(t.symbol));

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
    }));
  }

  async getKlines(symbol: string, interval: string, exchange: string = 'okx') {
    if (exchange === 'okx') {
      return this.getOkxKlines(symbol, interval);
    }
    if (exchange === 'polymarket') {
      return this.polymarketService.getKlines(symbol, interval);
    }
    if (exchange === 'binance') {
      return this.getBinanceKlines(symbol, interval);
    }
    return this.dexService.getKlines(symbol, interval);
  }

  private async getOkxKlines(symbol: string, interval: string) {
    const bar = OKX_INTERVAL_MAP[interval] || interval;
    const raw = await this.fetchOkxList<string[]>('/market/candles', {
      instId: symbol,
      bar,
      limit: '200',
    });
    if (!raw.length) return [];

    return raw.map((c) => ({
      openTime: Number(c[0]),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }

  private async getBinanceKlines(symbol: string, interval: string) {
    const raw = await this.getBinance<string[][]>('/klines', {
      symbol,
      interval,
      limit: 200,
    });
    if (!raw) return [];

    return raw.map((c) => ({
      openTime: Number(c[0]),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }

  async getDepth(symbol: string, limit = 20, exchange: string = 'okx') {
    switch (exchange) {
      case 'polymarket': return this.polymarketService.getDepth(symbol);
      case 'binance':    return this.getBinanceDepth(symbol, limit);
      case 'uniswap':    return this.dexService.getDepth(symbol);
    }
    return this.getOkxDepth(symbol, limit);
  }

  private async getOkxDepth(symbol: string, limit: number) {
    const raw = await this.fetchOkx<{ asks: string[]; bids: string[] }>(
      '/market/books',
      { instId: symbol, sz: String(limit) },
    );
    if (!raw) return null;

    return {
      symbol,
      bids: (raw.bids as unknown as string[][]).map((l) => [l[0], l[1]] as [string, string]),
      asks: (raw.asks as unknown as string[][]).map((l) => [l[0], l[1]] as [string, string]),
    };
  }

  private async getBinanceDepth(symbol: string, limit: number) {
    const raw = await this.getBinance<BinanceDepth>('/depth', { symbol, limit });
    if (!raw) return null;

    return {
      symbol,
      bids: raw.bids.map((l) => [l[0], l[1]] as [string, string]),
      asks: raw.asks.map((l) => [l[0], l[1]] as [string, string]),
    };
  }

  async getTrades(symbol: string, exchange: string = 'okx') {
    if (exchange === 'uniswap') {
      return this.dexService.getTrades(symbol);
    }
    if (exchange === 'polymarket') {
      return this.polymarketService.getTrades(symbol);
    }
    if (exchange === 'binance') {
      return this.getBinanceTrades(symbol);
    }
    return this.getOkxTrades(symbol);
  }

  private async getOkxTrades(symbol: string) {
    const trades = await this.fetchOkxList<OkxTrade>('/market/trades', {
      instId: symbol,
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

  private async getBinanceTrades(symbol: string) {
    const trades = await this.getBinance<BinanceTrade[]>('/trades', { symbol, limit: 50 });
    if (!trades) return [];

    return trades.map((t) => ({
      price: t.price,
      qty: t.qty,
      side: t.isBuyerMaker ? 'sell' : 'buy' as 'buy' | 'sell',
      ts: t.time,
    }));
  }
}
