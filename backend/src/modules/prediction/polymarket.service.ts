import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type {
  PredictionBookLevel,
  PredictionHistory,
  PredictionHistoryPoint,
  PredictionMarket,
  PredictionMarketDetail,
  PredictionMarketList,
  PredictionMarketSummary,
  PredictionOrderBook,
  PredictionSort,
  PredictionTrade,
} from './prediction.types';

// Polymarket 对外提供三类接口：
// - Gamma：市场/事件元数据、搜索
// - CLOB：订单簿、价格历史
// - Data API：成交流水
const DEFAULT_GAMMA_API = 'https://gamma-api.polymarket.com';
const DEFAULT_CLOB_API = 'https://clob.polymarket.com';
const DEFAULT_DATA_API = 'https://data-api.polymarket.com';

// Gamma 返回的原始市场结构（字段全部可选，避免上游增删字段时类型报错）
interface GammaEventRef {
  id?: string;
  slug?: string;
  title?: string;
  markets?: GammaMarket[];
}

interface GammaMarket {
  id?: string;
  question?: string;
  slug?: string;
  conditionId?: string;
  description?: string;
  image?: string;
  icon?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  volume24hrNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  startDate?: string;
  endDate?: string;
  startDateIso?: string;
  endDateIso?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  negRisk?: boolean;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  resolutionSource?: string;
  events?: GammaEventRef[];
}

interface CLOBLevel {
  price?: string;
  size?: string;
}

interface CLOBBook {
  bids?: CLOBLevel[];
  asks?: CLOBLevel[];
}

interface DataTrade {
  transactionHash?: string;
  side?: string;
  outcome?: string;
  outcomeIndex?: number;
  price?: number;
  size?: number;
  timestamp?: number;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

// 时间区间 -> CLOB prices-history 参数
const HISTORY_INTERVALS: Record<
  string,
  { interval: string; fidelity: number; windowSeconds?: number }
> = {
  '1d': { interval: '1d', fidelity: 5 },
  '1w': { interval: '1w', fidelity: 30 },
  // CLOB 的 1m 表示 1 分钟，这里用 max + startTs 表示最近 30 天
  '1m': { interval: 'max', fidelity: 120, windowSeconds: 30 * 24 * 60 * 60 },
  max: { interval: 'max', fidelity: 360 },
};

const SORT_PARAMS: Record<PredictionSort, { order: string; ascending: boolean }> = {
  volume: { order: 'volume24hr', ascending: false },
  liquidity: { order: 'liquidity', ascending: false },
  newest: { order: 'startDate', ascending: false },
  ending: { order: 'endDate', ascending: true },
};

const DEFAULT_OUTCOMES = ['Yes', 'No'];

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function roundPrice(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeSort(value?: string): PredictionSort {
  if (value === 'liquidity' || value === 'newest' || value === 'ending') return value;
  return 'volume';
}

@Injectable()
// Polymarket 预测市场数据服务：统一封装列表、详情、概率历史、盘口和成交
export class PolymarketService {
  private readonly logger = new Logger(PolymarketService.name);
  private readonly http = axios.create({ timeout: 12000 });
  // 运行期读取环境变量，确保 ConfigModule 已加载 .env 后再取值
  private readonly gammaApi = process.env.POLYMARKET_GAMMA_API || DEFAULT_GAMMA_API;
  private readonly clobApi = process.env.POLYMARKET_CLOB_API || DEFAULT_CLOB_API;
  private readonly dataApi = process.env.POLYMARKET_DATA_API || DEFAULT_DATA_API;
  // 简单内存缓存，避免前端轮询打爆上游；Map 超过上限时淘汰最早写入的键
  private readonly cache = new Map<string, CacheEntry>();

  // 通用缓存包装：命中直接返回，上游报错时优先返回旧数据
  private async cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value as T;

    try {
      const value = await loader();
      this.writeCache(key, value);
      return value;
    } catch (error) {
      if (hit) {
        this.logger.warn(`Polymarket 请求失败，使用缓存数据: ${(error as Error).message}`);
        return hit.value as T;
      }
      throw error;
    }
  }

  private writeCache(key: string, value: unknown): void {
    if (this.cache.size >= 200) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: Date.now(), value });
  }

  // 市场列表：默认按 24h 成交量排序，支持关键词搜索
  async listMarkets(params: {
    limit?: number;
    offset?: number;
    sort?: string;
    keyword?: string;
  }): Promise<PredictionMarketList> {
    const limit = clampInt(params.limit ?? 24, 1, 100);
    const offset = clampInt(params.offset ?? 0, 0, 10_000);
    const sort = normalizeSort(params.sort);
    const keyword = String(params.keyword ?? '').trim();
    const cacheKey = `list:${sort}:${offset}:${limit}:${keyword.toLowerCase()}`;

    return this.cached(cacheKey, 30_000, async () => {
      if (keyword) return this.searchMarkets(keyword, limit, offset);
      return this.fetchMarketList(sort, limit, offset);
    });
  }

  // 详情：市场 + 同一事件下的相关市场
  async getMarketDetail(slug: string): Promise<PredictionMarketDetail | null> {
    return this.cached(`detail:${slug}`, 30_000, async () => {
      const raw = await this.fetchMarketBySlug(slug);
      if (!raw) return null;

      const market = this.normalizeMarket(raw);
      const related = await this.fetchRelatedMarkets(raw);
      return { market, related };
    });
  }

  // 概率历史：优先使用 CLOB 的 prices-history
  async getHistory(slug: string, interval = '1w'): Promise<PredictionHistory | null> {
    const raw = await this.fetchMarketBySlug(slug);
    if (!raw) return null;

    const tokenId = parseStringArray(raw.clobTokenIds)[0] ?? '';
    const safeInterval = HISTORY_INTERVALS[interval] ? interval : '1w';
    const config = HISTORY_INTERVALS[safeInterval];
    if (!tokenId) {
      return { slug, tokenId: '', interval: safeInterval, fidelity: 0, points: [] };
    }

    const params: Record<string, string | number> = {
      market: tokenId,
      interval: config.interval,
      fidelity: config.fidelity,
    };
    if (config.windowSeconds) {
      params.startTs = Math.floor(Date.now() / 1000) - config.windowSeconds;
    }

    const points = await this.cached<PredictionHistoryPoint[]>(
      `history:${tokenId}:${safeInterval}`,
      60_000,
      async () => {
        const res = await this.http.get<{ history?: PredictionHistoryPoint[] }>(
          `${this.clobApi}/prices-history`,
          { params },
        );
        return Array.isArray(res.data?.history) ? res.data.history : [];
      },
    );

    return {
      slug,
      tokenId,
      interval: safeInterval,
      fidelity: config.fidelity,
      points: points
        .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
        .map((point) => ({ t: point.t, p: point.p })),
    };
  }

  // 盘口：YES 代币的 CLOB 订单簿
  async getOrderBook(slug: string, depth = 20): Promise<PredictionOrderBook | null> {
    const raw = await this.fetchMarketBySlug(slug);
    if (!raw) return null;

    const tokenId = parseStringArray(raw.clobTokenIds)[0] ?? '';
    const limit = clampInt(depth, 1, 100);
    if (!tokenId) {
      return { slug, tokenId: '', midpoint: null, spread: null, bids: [], asks: [] };
    }

    const book = await this.cached<{ bids: CLOBLevel[]; asks: CLOBLevel[] }>(
      `book:${tokenId}`,
      5_000,
      async () => {
        const res = await this.http.get<CLOBBook>(`${this.clobApi}/book`, {
          params: { token_id: tokenId },
        });
        return {
          bids: Array.isArray(res.data?.bids) ? res.data.bids : [],
          asks: Array.isArray(res.data?.asks) ? res.data.asks : [],
        };
      },
    );

    const bids = this.normalizeLevels(book.bids, 'bid').slice(0, limit);
    const asks = this.normalizeLevels(book.asks, 'ask').slice(0, limit);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;

    return {
      slug,
      tokenId,
      midpoint: bestBid !== null && bestAsk !== null ? roundPrice((bestBid + bestAsk) / 2) : null,
      spread: bestBid !== null && bestAsk !== null ? roundPrice(Math.max(0, bestAsk - bestBid)) : null,
      bids,
      asks,
    };
  }

  // 最近成交：Data API 按 conditionId 查询，包含 YES / NO 两边
  async getTrades(slug: string, limit = 50): Promise<PredictionTrade[] | null> {
    const raw = await this.fetchMarketBySlug(slug);
    if (!raw) return null;

    const conditionId = String(raw.conditionId ?? '');
    const market = this.normalizeMarket(raw);
    if (!conditionId) return [];

    const size = clampInt(limit, 1, 100);
    const trades = await this.cached<DataTrade[]>(
      `trades:${conditionId}:${size}`,
      10_000,
      async () => {
        const res = await this.http.get<DataTrade[]>(`${this.dataApi}/trades`, {
          params: { market: conditionId, limit: size },
        });
        return Array.isArray(res.data) ? res.data : [];
      },
    );

    return trades.map((trade, index) => {
      const price = roundPrice(toNumber(trade.price) ?? 0);
      const tradeSize = toNumber(trade.size) ?? 0;
      const outcomeIndex = Number.isFinite(trade.outcomeIndex) ? Number(trade.outcomeIndex) : 0;
      return {
        id: String(trade.transactionHash ?? `${trade.timestamp ?? 0}-${index}`),
        side: String(trade.side ?? '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
        outcome:
          trade.outcome ||
          market.outcomes[outcomeIndex]?.name ||
          (outcomeIndex === 0 ? 'Yes' : 'No'),
        outcomeIndex,
        price,
        size: tradeSize,
        value: price * tradeSize,
        ts: (toNumber(trade.timestamp) ?? 0) * 1000,
      };
    });
  }

  // 按排序参数分页拉取 Gamma 活跃市场
  private async fetchMarketList(
    sort: PredictionSort,
    limit: number,
    offset: number,
  ): Promise<PredictionMarketList> {
    try {
      const raw = await this.fetchGammaMarkets(sort, limit, offset);
      return {
        list: raw.map((market) => this.normalizeMarket(market)),
        total: null,
        offset,
        limit,
        hasMore: raw.length >= limit,
        upstream: true,
      };
    } catch (error) {
      this.logger.error(`获取 Polymarket 市场列表失败: ${(error as Error).message}`);
      return {
        list: [],
        total: null,
        offset,
        limit,
        hasMore: false,
        upstream: false,
        message: 'Polymarket 接口暂不可用，请稍后重试',
      };
    }
  }

  private async fetchGammaMarkets(
    sort: PredictionSort,
    limit: number,
    offset: number,
  ): Promise<GammaMarket[]> {
    const order = SORT_PARAMS[sort];
    const params: Record<string, string | number | boolean> = {
      active: true,
      closed: false,
      limit,
      offset,
      order: order.order,
      ascending: order.ascending,
    };
    if (sort === 'ending') {
      params.end_date_min = new Date().toISOString();
    }

    const res = await this.http.get<GammaMarket[]>(`${this.gammaApi}/markets`, { params });
    return Array.isArray(res.data) ? res.data : [];
  }

  // 关键词搜索：public-search 返回事件及其市场，保留搜索相关度顺序
  private async searchMarkets(
    keyword: string,
    limit: number,
    offset: number,
  ): Promise<PredictionMarketList> {
    try {
      const res = await this.http.get<{ events?: GammaEventRef[] }>(
        `${this.gammaApi}/public-search`,
        {
          params: {
            q: keyword,
            events_status: 'active',
            limit_per_type: 20,
            keep_closed_markets: 0,
          },
        },
      );

      const seen = new Set<string>();
      const markets: PredictionMarket[] = [];
      for (const event of res.data?.events ?? []) {
        for (const raw of event.markets ?? []) {
          const id = String(raw.id ?? '');
          if (!id || seen.has(id) || raw.closed === true) continue;
          seen.add(id);
          markets.push(this.normalizeMarket({ ...raw, events: [event] }));
        }
      }

      return {
        list: markets.slice(offset, offset + limit),
        total: markets.length,
        offset,
        limit,
        hasMore: offset + limit < markets.length,
        upstream: true,
      };
    } catch (error) {
      this.logger.warn(`Polymarket 搜索失败，回退到热门市场过滤: ${(error as Error).message}`);
      return this.searchFromTopMarkets(keyword, limit, offset);
    }
  }

  // public-search 不可用时，从热门市场里做本地关键词过滤
  private async searchFromTopMarkets(
    keyword: string,
    limit: number,
    offset: number,
  ): Promise<PredictionMarketList> {
    try {
      const raw = await this.fetchGammaMarkets('volume', 100, 0);
      const lower = keyword.toLowerCase();
      const filtered = raw
        .map((market) => this.normalizeMarket(market))
        .filter(
          (market) =>
            market.question.toLowerCase().includes(lower) ||
            market.eventTitle.toLowerCase().includes(lower),
        );

      return {
        list: filtered.slice(offset, offset + limit),
        total: filtered.length,
        offset,
        limit,
        hasMore: offset + limit < filtered.length,
        upstream: true,
      };
    } catch (error) {
      this.logger.error(`Polymarket 搜索回退失败: ${(error as Error).message}`);
      return {
        list: [],
        total: 0,
        offset,
        limit,
        hasMore: false,
        upstream: false,
        message: 'Polymarket 接口暂不可用，请稍后重试',
      };
    }
  }

  private async fetchMarketBySlug(slug: string): Promise<GammaMarket | null> {
    return this.cached(`market:${slug}`, 30_000, async () => {
      const res = await this.http.get<GammaMarket[]>(`${this.gammaApi}/markets`, {
        params: { slug },
      });
      return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
    });
  }

  // 同一事件下的其他市场，作为详情页的“相关市场”
  private async fetchRelatedMarkets(raw: GammaMarket): Promise<PredictionMarketSummary[]> {
    const eventSlug = raw.events?.[0]?.slug;
    if (!eventSlug) return [];

    try {
      const event = await this.cached<GammaEventRef | null>(`event:${eventSlug}`, 60_000, async () => {
        const res = await this.http.get<GammaEventRef[]>(`${this.gammaApi}/events`, {
          params: { slug: eventSlug },
        });
        return Array.isArray(res.data) && res.data.length ? res.data[0] : null;
      });

      if (!event?.markets?.length) return [];

      return event.markets
        .filter(
          (market) =>
            String(market.id ?? '') !== String(raw.id ?? '') &&
            market.active !== false &&
            market.closed !== true,
        )
        .map((market) => this.normalizeMarket({ ...market, events: [event] }))
        .map((market) => ({
          id: market.id,
          slug: market.slug,
          question: market.question,
          icon: market.icon,
          yesPrice: market.yesPrice,
          volumeTotal: market.volumeTotal,
          endDate: market.endDate,
        }))
        .sort((left, right) => right.volumeTotal - left.volumeTotal)
        .slice(0, 6);
    } catch (error) {
      this.logger.warn(`获取相关预测市场失败: ${(error as Error).message}`);
      return [];
    }
  }

  private normalizeLevels(levels: CLOBLevel[], side: 'bid' | 'ask'): PredictionBookLevel[] {
    const normalized: PredictionBookLevel[] = [];
    for (const level of levels) {
      const price = toNumber(level.price);
      const size = toNumber(level.size);
      if (price === null || size === null || price <= 0 || size <= 0) continue;
      normalized.push({ price, size });
    }

    // 买盘从高到低，卖盘从低到高
    return normalized.sort((left, right) =>
      side === 'bid' ? right.price - left.price : left.price - right.price,
    );
  }

  private normalizeMarket(raw: GammaMarket): PredictionMarket {
    const outcomeNames = parseStringArray(raw.outcomes);
    const outcomePrices = parseStringArray(raw.outcomePrices).map((value) => Number(value));
    const tokenIds = parseStringArray(raw.clobTokenIds);
    const names = outcomeNames.length ? outcomeNames : DEFAULT_OUTCOMES;

    const priceOfYes = Number.isFinite(outcomePrices[0]) ? outcomePrices[0] : null;
    const bestBid = toNumber(raw.bestBid);
    const bestAsk = toNumber(raw.bestAsk);
    const midpoint =
      bestBid !== null && bestAsk !== null && bestAsk >= bestBid ? (bestBid + bestAsk) / 2 : null;
    const lastTradePrice = toNumber(raw.lastTradePrice);

    const yesPrice = roundPrice(clampProbability(priceOfYes ?? lastTradePrice ?? midpoint ?? 0.5));
    const noPrice = roundPrice(
      Number.isFinite(outcomePrices[1])
        ? clampProbability(outcomePrices[1])
        : clampProbability(1 - yesPrice),
    );

    const event = raw.events?.[0];
    const spread =
      toNumber(raw.spread) ??
      (bestBid !== null && bestAsk !== null ? Math.max(0, bestAsk - bestBid) : null);

    return {
      id: String(raw.id ?? ''),
      slug: String(raw.slug ?? ''),
      question: String(raw.question ?? ''),
      description: String(raw.description ?? ''),
      image: String(raw.image ?? raw.icon ?? ''),
      icon: String(raw.icon ?? raw.image ?? ''),
      eventId: String(event?.id ?? ''),
      eventSlug: String(event?.slug ?? ''),
      eventTitle: String(event?.title ?? ''),
      outcomes: names.map((name, index) => ({
        name,
        price: roundPrice(
          Number.isFinite(outcomePrices[index])
            ? clampProbability(outcomePrices[index])
            : index === 0
              ? yesPrice
              : noPrice,
        ),
        tokenId: tokenIds[index] ?? '',
      })),
      yesPrice,
      noPrice,
      change24h: toNumber(raw.oneDayPriceChange),
      bestBid: bestBid !== null ? roundPrice(bestBid) : null,
      bestAsk: bestAsk !== null ? roundPrice(bestAsk) : null,
      spread: spread !== null ? roundPrice(spread) : null,
      volume24h: toNumber(raw.volume24hr) ?? toNumber(raw.volume24hrNum) ?? 0,
      volumeTotal: toNumber(raw.volumeNum) ?? toNumber(raw.volume) ?? 0,
      liquidity: toNumber(raw.liquidityNum) ?? toNumber(raw.liquidity) ?? 0,
      startDate: raw.startDate ?? raw.startDateIso ?? null,
      endDate: raw.endDate ?? raw.endDateIso ?? null,
      active: raw.active !== false,
      closed: raw.closed === true,
      acceptingOrders: raw.acceptingOrders === true,
      negRisk: raw.negRisk === true,
      resolutionSource: String(raw.resolutionSource ?? ''),
    };
  }
}
