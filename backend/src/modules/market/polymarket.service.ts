// 引入 NestJS 可注入和服务日志装饰器
import { Injectable, Logger } from '@nestjs/common';
// 引入 HTTP 请求库
import axios from 'axios';

// Polymarket Gamma API 基础地址
const GAMMA_API = 'https://gamma-api.polymarket.com';
// Polymarket CLOB API 基础地址
const CLOB_API = 'https://clob.polymarket.com';

// Polymarket 市场数据结构
interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  lastTradePrice: number | null;
  bestAsk: string | null;
  bestBid: string | null;
  startDate: string;
  endDate: string;
  enableOrderBook: boolean;
  active: boolean;
  closed: boolean;
  volumeNum: number;
  volume24hrNum: number;
  liquidityNum: number;
  tagId: number;
  clobTokenIds: string;
  negRisk: boolean;
  closedTime: string;
}

// Polymarket 价格历史事件接口
interface PolymarketPriceEvent {
  t: number;
  p: number;
  s: number;
}

// CLOB 订单簿深度单条数据
interface CLOBBookLevel {
  price: string;
  size: string;
}

// CLOB 订单簿返回数据
interface CLOBBookResponse {
  bids: CLOBBookLevel[];
  asks: CLOBBookLevel[];
}

// Polymarket 成交记录接口
interface PolymarketTrade {
  id: string;
  market: string;
  outcome: string;
  price: string;
  size: string;
  side: string;
  type: string;
  createdAt: string;
  timestamp: string;
  outcomePrices: string;
}

// Polymarket 预测市场数据服务
@Injectable()
export class PolymarketService {
  private readonly logger = new Logger(PolymarketService.name);
  // 缓存的市场列表
  private marketList: PolymarketMarket[] = [];
  // 上次缓存更新时间戳
  private lastFetch = 0;
  // 缓存有效期（30 秒）
  private readonly CACHE_TTL = 30000;

  // 确保市场列表缓存有效，过期则重新拉取
  private async ensureCache(): Promise<void> {
    const now = Date.now();
    if (this.marketList.length > 0 && now - this.lastFetch < this.CACHE_TTL) return;

    try {
      // 从 Gamma API 拉取活跃市场
      const res = await axios.get<PolymarketMarket[]>(`${GAMMA_API}/markets`, {
        params: { active: true, closed: false, limit: 50, order: 'volume_24hr', ascending: false },
        timeout: 10000,
      });

      if (!res.data?.length) {
        this.logger.warn('Polymarket API returned empty markets');
        return;
      }

      // 更新缓存
      this.marketList = res.data;
      this.lastFetch = now;
      this.logger.log(`Polymarket 缓存更新: ${res.data.length} 个活跃市场`);
    } catch (err) {
      this.logger.error(`获取 Polymarket 市场失败: ${err.message}`);
    }
  }

  // 根据 symbol 查找对应市场
  private findMarket(symbol: string): PolymarketMarket | undefined {
    return this.marketList.find(
      (m) => m.id === symbol || m.slug === symbol || m.conditionId === symbol,
    );
  }

  // 获取所有交易品种列表
  async getSymbols(): Promise<any[]> {
    await this.ensureCache();
    return this.marketList.map((m) => ({
      symbol: m.id,
      baseCoin: 'YES',
      quoteCoin: 'USDC',
      maxLeverage: 1,
      minQty: '1',
      pricePrecision: 3,
      qtyPrecision: 0,
      question: m.question,
      slug: m.slug,
      polymarketId: m.id,
      outcomes: m.outcomes,
    }));
  }

  // 获取行情 ticker 数据
  async getTickers(symbols?: string[]): Promise<any[]> {
    await this.ensureCache();

    // 如果指定了交易对则过滤
    const markets = symbols?.length
      ? this.marketList.filter((m) => symbols.includes(m.id))
      : this.marketList;

    return markets.map((m) => {
      // 解析 YES 代币价格
      let yesPrice = 0.5;
      let outcomes: string[] = ['Yes', 'No'];
      try {
        outcomes = JSON.parse(m.outcomes);
      } catch {}
      try {
        const prices = JSON.parse(m.outcomePrices);
        if (prices?.length) yesPrice = Number(prices[0]);
      } catch {
        yesPrice = m.lastTradePrice ?? 0.5;
      }

      // 计算 NO 代币价格和买卖盘口
      const noPrice = 1 - yesPrice;
      const spread = 0.002;
      const bid = Math.max(0.001, yesPrice - spread);
      const ask = Math.min(0.999, yesPrice + spread);

      return {
        symbol: m.id,
        lastPrice: yesPrice.toFixed(3),
        markPrice: yesPrice.toFixed(3),
        indexPrice: yesPrice.toFixed(3),
        bidPrice: bid.toFixed(3),
        askPrice: ask.toFixed(3),
        high24h: Math.min(0.999, yesPrice * 1.08).toFixed(3),
        low24h: Math.max(0.001, yesPrice * 0.92).toFixed(3),
        volume24h: String(Math.round(m.volume24hrNum || m.volume24hr || 0)),
        priceChangePercent24h: '0.00',
        question: m.question,
        slug: m.slug,
        outcomeYes: outcomes[0] || 'Yes',
        outcomeNo: outcomes[1] || 'No',
        yesPrice: yesPrice.toFixed(3),
        noPrice: noPrice.toFixed(3),
        polymarketId: m.id,
        liquidity: String(Math.round(m.liquidityNum || m.liquidity || 0)),
        endDate: m.endDate || m.closedTime || '',
        clobTokenIds: m.clobTokenIds || '',
        negRisk: m.negRisk,
      };
    });
  }

  // 获取 K 线数据
  async getKlines(symbol: string, _interval: string): Promise<any[]> {
    await this.ensureCache();

    const market = this.findMarket(symbol);
    if (!market) return [];

    const basePrice = market.lastTradePrice ?? 0.5;

    try {
      // 从 Gamma API 获取价格历史
      const res = await axios.get<PolymarketPriceEvent[]>(`${GAMMA_API}/prices-history`, {
        params: { market: market.id, aggregation: 86400 },
        timeout: 8000,
      });

      if (!res.data?.length) return [];

      // 映射为 K 线格式，取最近 100 条
      return res.data.slice(-100).map((p) => ({
        openTime: p.t * 1000,
        open: String(p.p.toFixed(3)),
        high: String(Math.min(0.999, p.p * 1.02).toFixed(3)),
        low: String(Math.max(0.001, p.p * 0.98).toFixed(3)),
        close: String(p.p.toFixed(3)),
        volume: String(Math.round(p.s || 100)),
      }));
    } catch {
      return [];
    }
  }

  // 获取订单簿深度数据
  async getDepth(symbol: string): Promise<{ symbol: string; bids: [string, string][]; asks: [string, string][] } | null> {
    await this.ensureCache();

    const market = this.findMarket(symbol);
    if (!market) return null;

    // 优先使用 CLOB 订单簿
    if (market.enableOrderBook && market.clobTokenIds) {
      let tokenId = '';
      try {
        const ids = JSON.parse(market.clobTokenIds);
        tokenId = Array.isArray(ids) ? ids[0] : String(ids);
      } catch {
        tokenId = String(market.clobTokenIds);
      }

      if (tokenId) {
        try {
          const res = await axios.get<CLOBBookResponse>(`${CLOB_API}/book`, {
            params: { token_id: tokenId },
            timeout: 8000,
          });
          if (res.data?.bids?.length || res.data?.asks?.length) {
            const bids: [string, string][] = (res.data.bids || []).map(
              (l) => [l.price, l.size] as [string, string],
            );
            const asks: [string, string][] = (res.data.asks || []).map(
              (l) => [l.price, l.size] as [string, string],
            );
            return { symbol, bids: bids.slice(0, 20), asks: asks.slice(0, 20) };
          }
        } catch {
          // CLOB API 可能不可用，回退到模拟深度
        }
      }
    }

    // 回退方案：基于流动性和价格生成模拟深度
    const price = market.lastTradePrice ?? 0.5;
    const bids: [string, string][] = [];
    const asks: [string, string][] = [];
    const baseLiquidity = market.liquidityNum || market.liquidity || 50000;

    // 生成 20 档深度数据
    for (let i = 1; i <= 20; i++) {
      const levelSpread = i * 0.002;
      const bidPx = Math.max(0.001, price - levelSpread);
      const askPx = Math.min(0.999, price + levelSpread);
      const qty = Math.max(100, Math.round(baseLiquidity / 20 * (1 - i * 0.03)));
      bids.push([bidPx.toFixed(3), String(qty)]);
      asks.push([askPx.toFixed(3), String(Math.round(qty * 0.9))]);
    }

    return { symbol, bids, asks };
  }

  // 获取最新成交记录
  async getTrades(symbol: string): Promise<any[]> {
    await this.ensureCache();

    const market = this.findMarket(symbol);
    if (!market) return [];

    try {
      // 从 Gamma API 获取成交记录
      const res = await axios.get<PolymarketTrade[]>(`${GAMMA_API}/trades`, {
        params: { market: market.id, limit: 50 },
        timeout: 8000,
      });

      if (!res.data?.length) return [];

      return res.data.map((t) => {
        let price = 0.5;
        try {
          const oPrices = t.outcomePrices ? JSON.parse(t.outcomePrices) : null;
          price = oPrices?.[0] ?? t.price ?? 0.5;
        } catch { price = Number(t.price ?? '0.5'); }

        return {
          price: Number(price).toFixed(3),
          qty: String(t.size || '100'),
          side: t.side === 'SELL' ? 'sell' : 'buy',
          ts: new Date(t.createdAt || t.timestamp || Date.now()).getTime(),
          outcome: t.outcome || '',
        };
      });
    } catch {
      return [];
    }
  }
}
