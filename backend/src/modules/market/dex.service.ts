import { Injectable, Logger } from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';

interface UniswapPool {
  id: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
  feeTier: string;
  liquidity: string;
  sqrtPrice: string;
  tick: string;
  volumeUSD: string;
  volumeToken0: string;
  volumeToken1: string;
  txCount: string;
  totalValueLockedUSD: string;
}

interface UniswapSwap {
  id: string;
  timestamp: string;
  amount0: string;
  amount1: string;
  amountUSD: string;
  sqrtPrice: string;
  tick: string;
  origin: string;
}

interface UniswapPoolDayData {
  id: string;
  date: number;
  volumeUSD: string;
  tvlUSD: string;
  feesUSD: string;
  close: string;
  high: string;
  low: string;
  open: string;
}

const TOKEN_MAP: Record<string, { address: string; decimals: number }> = {
  'ETH': { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 },
  'BTC': { address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8 },
  'SOL': { address: '0xd31a59c85ae9d8edefec411d448f90841571b89c', decimals: 9 },
  'DOGE': { address: '0x3832d2a5c4f4eac0b810a6cf759b2c4f3ca5f41e', decimals: 8 },
  'XRP': { address: '0x6f40d4a6237c257fff2db00fa0510dee4cce415b', decimals: 8 },
};

const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const UNISWAP_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
const POOL_FEE = '3000'; 

@Injectable()
export class DexService {
  private readonly logger = new Logger(DexService.name);
  private client: GraphQLClient;
  private poolCache = new Map<string, { id: string; token0: string; token1: string; decimals: [number, number] }>();

  constructor() {
    this.client = new GraphQLClient(UNISWAP_SUBGRAPH);
  }

  private mapSymbolToToken(symbol: string): { base: string; quote: string } | null {
    const parts = symbol.replace('-USDT-SWAP', '').replace('-USDT', '').split('-');
    const base = parts[0];
    if (!TOKEN_MAP[base]) return null;
    return { base: TOKEN_MAP[base].address, quote: USDT_ADDRESS };
  }

  private async resolvePool(symbol: string): Promise<{ id: string; baseDecimals: number; quoteDecimals: number } | null> {
    const cached = this.poolCache.get(symbol);
    if (cached) return { id: cached.id, baseDecimals: cached.decimals[0], quoteDecimals: cached.decimals[1] };

    const tokens = this.mapSymbolToToken(symbol);
    if (!tokens) return null;

    const query = `{
      pools(where: { token0: "${tokens.base}", token1: "${USDT_ADDRESS}", feeTier: "${POOL_FEE}" }, first: 1) {
        id token0 { id symbol decimals } token1 { id symbol decimals } feeTier
      }
    }`;
    try {
      const data: any = await this.client.request(query);
      if (!data?.pools?.length) return null;
      const pool = data.pools[0];
      const isToken0Base = pool.token0.id.toLowerCase() === tokens.base.toLowerCase();
      const result = {
        id: pool.id,
        baseDecimals: isToken0Base ? Number(pool.token0.decimals) : Number(pool.token1.decimals),
        quoteDecimals: isToken0Base ? Number(pool.token1.decimals) : Number(pool.token0.decimals),
      };
      this.poolCache.set(symbol, { id: result.id, token0: pool.token0.id, token1: pool.token1.id, decimals: [result.baseDecimals, result.quoteDecimals] });
      return result;
    } catch (err) {
      this.logger.error(`resolvePool error: ${err.message}`);
      return null;
    }
  }

  private tickToPrice(tick: number, baseDecimals: number, quoteDecimals: number): number {
    return Math.pow(1.0001, tick) * Math.pow(10, baseDecimals - quoteDecimals);
  }

  async getTickers(symbols?: string[]): Promise<any[]> {
    const targetSymbols = symbols || Object.keys(TOKEN_MAP).map((b) => `${b}-USDT`);

    const results: any[] = [];
    for (const sym of targetSymbols) {
      const poolInfo = await this.resolvePool(sym + '-SWAP');
      if (!poolInfo) continue;

      const query = `{
        pool(id: "${poolInfo.id}") {
          id token0 { symbol decimals } token1 { symbol decimals }
          sqrtPrice tick liquidity volumeUSD volumeToken0 volumeToken1 txCount totalValueLockedUSD
          poolDayData(first: 2, orderBy: date, orderDirection: desc) {
            date volumeUSD high low close open feesUSD
          }
        }
      }`;
      try {
        const data: any = await this.client.request(query);
        if (!data?.pool) continue;
        const p = data.pool;
        const tick = Number(p.tick);
        const price = this.tickToPrice(tick, Number(p.token0.decimals), Number(p.token1.decimals));
        const dayData = p.poolDayData?.[0];
        const open = dayData ? Number(dayData.open) : price;
        const high24h = dayData ? String(Number(dayData.high)) : String(price);
        const low24h = dayData ? String(Number(dayData.low)) : String(price);
        const changePct = open ? ((price - open) / open * 100).toFixed(2) : '0.00';

        results.push({
          symbol: sym,
          lastPrice: price.toFixed(6),
          markPrice: price.toFixed(6),
          indexPrice: price.toFixed(6),
          bidPrice: (price * 0.999).toFixed(6),
          askPrice: (price * 1.001).toFixed(6),
          high24h,
          low24h,
          volume24h: Number(p.volumeUSD).toFixed(2),
          priceChangePercent24h: changePct,
        });
      } catch (err) {
        this.logger.error(`getTicker error for ${sym}: ${err.message}`);
      }
    }
    return results;
  }

  async getKlines(symbol: string, interval: string): Promise<any[]> {
    const poolInfo = await this.resolvePool(symbol);
    if (!poolInfo) return [];

    const days = interval === '1D' ? 30 : interval === '4h' ? 7 : interval === '1h' ? 3 : 1;

    const query = `{
      poolDayDatas(first: ${days}, orderBy: date, orderDirection: desc, where: { pool: "${poolInfo.id}" }) {
        id date volumeUSD tvlUSD feesUSD open high low close
      }
    }`;
    try {
      const data: any = await this.client.request(query);
      if (!data?.poolDayDatas?.length) return [];

      return data.poolDayDatas.map((d: UniswapPoolDayData) => ({
        openTime: d.date * 1000,
        open: String(Number(d.open).toFixed(6)),
        high: String(Number(d.high).toFixed(6)),
        low: String(Number(d.low).toFixed(6)),
        close: String(Number(d.close).toFixed(6)),
        volume: String(Number(d.volumeUSD).toFixed(2)),
      })).reverse();
    } catch (err) {
      this.logger.error(`getKlines error: ${err.message}`);
      return [];
    }
  }

  async getDepth(symbol: string): Promise<{ symbol: string; bids: [string, string][]; asks: [string, string][] } | null> {
    const poolInfo = await this.resolvePool(symbol);
    if (!poolInfo) return null;

    const query = `{
      pool(id: "${poolInfo.id}") {
        tick sqrtPrice liquidity token0 { decimals symbol } token1 { decimals symbol }
        ticks(first: 20, orderBy: tickIdx, orderDirection: desc, where: { liquidityNet_not: "0" }) {
          tickIdx liquidityNet liquidityGross
        }
      }
    }`;
    try {
      const data: any = await this.client.request(query);
      if (!data?.pool) return null;

      const p = data.pool;
      const currentTick = Number(p.tick);
      const currentPrice = this.tickToPrice(currentTick, Number(p.token0.decimals), Number(p.token1.decimals));
      const liquidity = Number(p.liquidity);

      const bids: [string, string][] = [];
      const asks: [string, string][] = [];

      for (let i = 0; i < 20; i++) {
        const tickDown = currentTick - (i + 1) * 10;
        const tickUp = currentTick + (i + 1) * 10;
        const bidPrice = this.tickToPrice(tickDown, Number(p.token0.decimals), Number(p.token1.decimals));
        const askPrice = this.tickToPrice(tickUp, Number(p.token0.decimals), Number(p.token1.decimals));
        const baseQty = liquidity / (currentPrice * 1000) / 20;
        bids.push([bidPrice.toFixed(6), Math.max(0.01, baseQty * (1 + i * 0.1)).toFixed(4)]);
        asks.push([askPrice.toFixed(6), Math.max(0.01, baseQty * (1 + i * 0.1)).toFixed(4)]);
      }

      return {
        symbol,
        bids: bids.reverse(),
        asks,
      };
    } catch (err) {
      this.logger.error(`getDepth error: ${err.message}`);
      return null;
    }
  }

  async getTrades(symbol: string): Promise<any[]> {
    const poolInfo = await this.resolvePool(symbol);
    if (!poolInfo) return [];

    const query = `{
      swaps(first: 50, orderBy: timestamp, orderDirection: desc, where: { pool: "${poolInfo.id}" }) {
        id timestamp amount0 amount1 amountUSD sqrtPrice tick origin
      }
    }`;
    try {
      const data: any = await this.client.request(query);
      if (!data?.swaps?.length) return [];

      return data.swaps.map((s: UniswapSwap) => {
        const amount0 = Number(s.amount0);
        const amount1 = Number(s.amount1);
        const price = Math.abs(amount1 / amount0);
        return {
          price: price.toFixed(6),
          qty: Math.abs(amount0).toFixed(4),
          side: amount1 > 0 ? 'buy' : 'sell',
          ts: Number(s.timestamp) * 1000,
        };
      });
    } catch (err) {
      this.logger.error(`getTrades error: ${err.message}`);
      return [];
    }
  }
}
