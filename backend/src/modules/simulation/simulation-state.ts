import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MarketService } from '../market/market.service';
import { RequestContextService } from '../auth/request-context.service';
import { NotificationService } from '../notifications/notification.service';
import { AccountEventService } from '../account-events/account-event.service';
import { createInitialState, round, SimulationEngine } from './simulation-engine';
import {
  AccountSnapshot,
  DEFAULT_ENGINE_CONFIG,
  EquityPoint,
  MarketSnapshot,
  OrderSnapshot,
  PlaceOrderResult,
  PositionSnapshot,
  PredictionMarketSnapshot,
  PredictionOrderInput,
  PredictionOrderSnapshot,
  PredictionPlaceResult,
  PredictionPositionSnapshot,
  PreviewResult,
  SIM_ERROR,
  SimAccountState,
  SimLedgerEntry,
  SimOrder,
  SimPredictionPosition,
  SimulationError,
  SimulationOrderInput,
  SpotHoldingSnapshot,
  SpotOrderSnapshot,
  SpotTradeInput,
  SpotTradeResult,
} from './simulation.types';

interface OkxTickerLike {
  symbol: string;
  lastPrice?: string;
  markPrice?: string;
  bidPrice?: string;
  askPrice?: string;
}

interface CachedMarket {
  market: MarketSnapshot;
  ts: number;
}

interface PersistedFile {
  version: 2;
  account: SimAccountState;
}

const PRICE_CACHE_TTL_MS = 15_000;
const TICK_INTERVAL_MS = 3_000;

/**
 * 模拟盘门面：负责持久化、行情获取、后台撮合，以及把引擎内部数字格式化成 API 字符串。
 *
 * 真实账务逻辑全部在 SimulationEngine，本类不参与余额计算。
 */
@Injectable()
export class SimulationState implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationState.name);
  private readonly dataDir: string;
  private readonly primaryUserId = 'u_demo';
  private readonly engines = new Map<string, SimulationEngine>();
  private readonly engineFiles = new Map<string, string>();
  private readonly priceCache = new Map<string, CachedMarket>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private capitalRebased = false;

  constructor(
    private readonly marketService: MarketService,
    private readonly context: RequestContextService,
    private readonly notifications: NotificationService,
    private readonly accountEvents: AccountEventService,
  ) {
    this.dataDir = path.resolve(__dirname, '../../../data');
    this.getEngine(this.primaryUserId);

    // 启动时加载所有已有模拟账户，确保用户不在线时仍能触发强平/止盈止损通知。
    try {
      for (const name of fs.readdirSync(this.dataDir)) {
        const match = /^simulation-([A-Za-z0-9_-]+)\.json$/.exec(name);
        if (match && !match[1].startsWith('u_guest_')) this.getEngine(match[1]);
      }
    } catch (error) {
      this.logger.warn(`扫描模拟账户失败: ${(error as Error).message}`);
    }
  }

  private get engine(): SimulationEngine {
    return this.getEngine(this.context.userId());
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let index = 0; index < userId.length; index += 1) {
      hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
    }
    return hash;
  }

  private getEngine(userId: string): SimulationEngine {
    const key = userId || this.primaryUserId;
    const existing = this.engines.get(key);
    if (existing) return existing;

    const safe = key.replace(/[^A-Za-z0-9_-]/g, '_');
    const filePath = path.join(this.dataDir, key === this.primaryUserId ? 'simulation.json' : `simulation-${safe}.json`);
    const loaded = this.loadState(filePath);
    const engine = new SimulationEngine(loaded);
    if (key !== this.primaryUserId) {
      // 让不同用户的资源 ID 落在不同区段，跨用户按 ID 访问时不会误命中自己的订单/持仓。
      const base = 100000 + (this.hashUserId(key) % 800000);
      const state = engine.getState();
      state.nextOrderId = Math.max(state.nextOrderId, base);
      state.nextPositionId = Math.max(state.nextPositionId, base);
      state.nextSpotOrderId = Math.max(state.nextSpotOrderId, base);
      state.nextSpotHoldingId = Math.max(state.nextSpotHoldingId, base);
      state.nextPredictionOrderId = Math.max(state.nextPredictionOrderId, base);
      state.nextPredictionPositionId = Math.max(state.nextPredictionPositionId, base);
    }
    this.engines.set(key, engine);
    this.engineFiles.set(key, filePath);
    if (this.capitalRebased) {
      this.capitalRebased = false;
      this.saveUser(key);
    }
    const state = engine.getState();
    this.logger.log(
      `模拟盘[${key}]已加载：钱包 ${state.walletBalance.toFixed(2)} USDT，持仓 ${state.positions.length} 个，预测持仓 ${state.predictionPositions.length} 个`,
    );
    return engine;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    for (const userId of this.engines.keys()) this.saveUser(userId);
  }

  // ---------------------------------------------------------------- 对外查询

  async getAccountSnapshot(): Promise<Record<string, unknown>> {
    const markets = await this.fetchMarkets(this.engine.trackedSymbols());
    return this.toAccount(this.engine.snapshot(markets));
  }

  async getPositions(): Promise<Record<string, unknown>[]> {
    const symbols = this.engine
      .listPositions({})
      .map((p) => p.symbol);
    const markets = await this.fetchMarkets(symbols);
    return this.engine.listPositions(markets).map((p) => this.toPosition(p));
  }

  // ---------------------------------------------------------------- 现货查询/交易

  async getSpotHoldings(): Promise<Record<string, unknown>[]> {
    const symbols = this.engine
      .listSpotHoldings({})
      .map((holding) => holding.symbol);
    const markets = await this.fetchMarkets(symbols);
    return this.engine.listSpotHoldings(markets).map((holding) => this.toSpotHolding(holding));
  }

  getSpotOrders(symbol?: string): Record<string, unknown>[] {
    return this.engine
      .getSpotOrderSnapshots(symbol)
      .map((order) => this.toSpotOrder(order));
  }

  async placeSpotOrder(input: SpotTradeInput): Promise<Record<string, unknown>> {
    this.assertSimulationMode(input.mode);
    const symbol = String(input.symbol || '').trim();
    if (!symbol) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '交易对不能为空');

    const markets = await this.fetchMarkets([symbol]);
    const market = markets[symbol];
    if (!market) {
      throw new SimulationError(SIM_ERROR.MARKET_UNAVAILABLE, '现货行情暂不可用，请稍后重试');
    }

    const result = this.engine.placeSpotOrder(input, market);
    this.save();
    this.publishRealtime(this.context.userId(), markets);
    return this.toSpotResult(result);
  }

  // ---------------------------------------------------------------- 预测市场查询/交易

  getPredictionPosition(id: string): SimPredictionPosition | undefined {
    return this.engine.getPredictionPosition(id);
  }

  getOpenPredictionSlugs(): string[] {
    return this.engine.trackedPredictionSlugs();
  }

  getPredictionPositions(): Record<string, unknown>[] {
    return this.engine.listPredictionPositions().map((position) => this.toPredictionPosition(position));
  }

  getPredictionOrders(slug?: string): Record<string, unknown>[] {
    return this.engine
      .getPredictionOrderSnapshots(slug)
      .map((order) => this.toPredictionOrder(order));
  }

  applyPredictionMarks(marks: Record<string, PredictionMarketSnapshot>): void {
    const changed = this.engine.updatePredictionMarks(marks);
    if (changed) {
      this.save();
      this.publishRealtime(this.context.userId());
    }
  }

  placePredictionOrder(
    input: PredictionOrderInput,
    market: PredictionMarketSnapshot,
  ): Record<string, unknown> {
    this.assertSimulationMode(input.mode);
    const result = this.engine.placePredictionOrder(input, market);
    this.save();
    this.publishRealtime(this.context.userId());
    return this.toPredictionResult(result);
  }

  closePredictionPosition(
    positionId: string,
    qty: string | number | undefined,
    market: PredictionMarketSnapshot,
  ): Record<string, unknown> {
    const result = this.engine.closePredictionPosition(positionId, qty, market);
    this.save();
    this.publishRealtime(this.context.userId());
    return this.toPredictionResult(result);
  }

  getOpenOrders(symbol?: string): Record<string, unknown>[] {
    return this.engine.getOrderSnapshots('open', symbol).map((o) => this.toOrder(o));
  }

  getHistoryOrders(symbol?: string): Record<string, unknown>[] {
    return this.engine.getOrderSnapshots('history', symbol).map((o) => this.toOrder(o));
  }

  getFills(): Record<string, unknown>[] {
    return this.engine.getOrderSnapshots('fills').map((o) => ({
      ...this.toOrder(o),
      fillId: `fill_${o.orderId}`,
      fillPrice: o.avgFillPrice == null ? '0' : this.price(o.avgFillPrice),
      fillQty: this.qty(o.filledQty),
      liquidity: o.source === 'user' ? 'taker' : 'system',
    }));
  }

  getLedger(mode = 'simulation', limit = 100): Record<string, unknown>[] {
    if (mode !== 'simulation') return [];
    return this.engine.getLedger(limit).map((entry) => this.toLedger(entry));
  }

  getEquityHistory(range = '30d'): EquityPoint[] {
    return this.engine.getEquityHistory(range);
  }

  // ---------------------------------------------------------------- 交易动作

  async previewOrder(input: SimulationOrderInput): Promise<Record<string, unknown>> {
    const meta = await this.getInstrumentMetaOrThrow(input.symbol);
    const market = await this.requireMarket(input.symbol);
    await this.validateInstrumentOrder(input, market, meta);
    const preview = this.engine.preview(input, market);
    return this.toPreview(preview);
  }

  async placeOrder(input: SimulationOrderInput): Promise<Record<string, unknown>> {
    const meta = await this.getInstrumentMetaOrThrow(input.symbol);
    const market = await this.requireMarket(input.symbol);
    await this.validateInstrumentOrder(input, market, meta);
    const userId = this.context.userId();

    try {
      const result = this.engine.placeOrder(input, market);
      this.save();
      this.publishRealtime(userId, { [input.symbol]: market });
      return this.toPlaceOrderResult(result);
    } catch (error) {
      // 失败的下单也会留下 rejected 订单，便于前端/审计看到拒绝原因。
      this.save();
      this.publishRealtime(userId, { [input.symbol]: market });
      throw error;
    }
  }

  cancelOrder(orderId: string): Record<string, unknown> {
    const order = this.engine.cancelOrder(orderId);
    this.save();
    this.publishRealtime(this.context.userId());
    return this.toOrder(this.toOrderSnapshot(order));
  }

  async closePosition(
    positionId: string,
    qty?: string | number,
    fallbackSymbol?: string,
  ): Promise<Record<string, unknown>> {
    const positions = this.engine.listPositions({});
    let resolvedId = positionId;
    if (!positions.some((p) => p.id === positionId)) {
      const bySymbol = fallbackSymbol ? positions.find((p) => p.symbol === fallbackSymbol) : undefined;
      if (bySymbol) resolvedId = bySymbol.id;
    }

    const position = positions.find((p) => p.id === resolvedId);
    if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '持仓不存在');

    const market = await this.requireMarket(position.symbol);
    const userId = this.context.userId();
    try {
      const result = this.engine.closePosition(resolvedId, qty, market);
      this.save();
      this.publishRealtime(userId, { [position.symbol]: market });
      const stillOpen = this.engine
        .listPositions({})
        .some((item) => item.id === resolvedId);
      if (!stillOpen) {
        const realizedPnl = this.engine
          .getState()
          .positions.find((item) => item.id === resolvedId)?.realizedPnl;
        this.accountEvents.emitPositionClosed(userId, {
          positionId: resolvedId,
          symbol: position.symbol,
          reason: 'manual',
          realizedPnl,
        });
      }
      return this.toPlaceOrderResult(result);
    } catch (error) {
      this.save();
      this.publishRealtime(userId, { [position.symbol]: market });
      throw error;
    }
  }

  updatePositionRisk(
    positionId: string,
    takeProfitPrice?: string | number | null,
    stopLossPrice?: string | number | null,
  ): Record<string, unknown> {
    this.engine.updateRisk(positionId, takeProfitPrice, stopLossPrice);
    this.save();
    this.publishRealtime(this.context.userId());
    const position = this.engine.listPositions({}).find((p) => p.id === positionId);
    return position ? this.toPosition(position) : { positionId, status: 'updated' };
  }

  reset(): Record<string, unknown> {
    const snapshot = this.engine.reset();
    this.save();
    this.publishRealtime(this.context.userId());
    return this.toAccount(snapshot);
  }

  // ---------------------------------------------------------------- 行情与后台撮合

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const symbols = Array.from(
        new Set(
          Array.from(this.engines.values()).flatMap((engine) => engine.trackedSymbols()),
        ),
      );
      if (!symbols.length) return;

      const markets = await this.fetchMarkets(symbols);
      for (const [userId, engine] of this.engines) {
        const beforeOrders = new Set(engine.getState().orders.map((order) => order.orderId));
        const beforePositions = new Map(
          engine.listPositions({}).map((position) => [position.id, position]),
        );
        const result = engine.processMarkets(markets);

        // 强平/止盈/止损订单只在触发瞬间产生一次，按新增订单识别并留档。
        const newOrders = engine
          .getState()
          .orders.filter(
            (order) =>
              !beforeOrders.has(order.orderId) &&
              ['liquidation', 'tp', 'sl'].includes(order.source) &&
              order.status === 'filled',
          );
        const closeReasons = new Map<string, 'liquidation' | 'tp' | 'sl'>();
        for (const order of newOrders) {
          if (order.positionId) {
            closeReasons.set(order.positionId, order.source as 'liquidation' | 'tp' | 'sl');
          }
          const position = engine
            .getState()
            .positions.find((item) => item.id === order.positionId);
          this.notifications.notifyTriggeredOrder(
            userId,
            {
              orderId: order.orderId,
              symbol: order.symbol,
              side: order.side,
              qty: order.filledQty || order.qty,
              avgFillPrice: order.avgFillPrice,
              source: order.source as 'liquidation' | 'tp' | 'sl',
              positionId: order.positionId,
            },
            position?.realizedPnl,
          );
        }

        // 风险等级跨档预警；同一档位只提醒一次。
        this.notifications.syncRisk(
          userId,
          engine.listPositions(markets).map((position) => ({
            id: position.id,
            symbol: position.symbol,
            side: position.side,
            leverage: position.leverage,
            qty: position.qty,
            entryPrice: position.entryPrice,
            markPrice: position.markPrice,
            liquidationPrice: position.liquidationPrice,
            unrealizedPnl: position.unrealizedPnl,
          })),
        );

        const afterPositionIds = new Set(engine.listPositions({}).map((position) => position.id));
        for (const [positionId, position] of beforePositions) {
          if (afterPositionIds.has(positionId)) continue;
          this.accountEvents.emitPositionClosed(userId, {
            positionId,
            symbol: position.symbol,
            reason: closeReasons.get(positionId) || 'manual',
            realizedPnl: engine
              .getState()
              .positions.find((item) => item.id === positionId)?.realizedPnl,
          });
        }

        if (result.changed) {
          this.saveUser(userId);
          for (const event of result.events) this.logger.log(`[${userId}] ${event}`);
        }

        // 每个 tick 都推送最新快照；即使没有成交，持仓保证金率/PnL 也会变化。
        this.publishRealtime(userId, markets);
      }
    } catch (error) {
      this.logger.error(`模拟盘后台撮合失败: ${(error as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async requireMarket(symbol: string): Promise<MarketSnapshot> {
    if (!symbol) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '交易对不能为空');
    const markets = await this.fetchMarkets([symbol]);
    const market = markets[symbol];
    if (!market) {
      throw new SimulationError(
        SIM_ERROR.MARKET_UNAVAILABLE,
        `无法获取 ${symbol} 行情，请检查网络或稍后重试`,
      );
    }
    return market;
  }

  /**
   * 批量拉取行情。按交易对格式自动识别交易所：
   * - BTC-USDT-SWAP -> OKX
   * - BTCUSDT       -> Binance
   * - BTC-USD       -> Coinbase
   *
   * 这样模拟盘可以在三个交易所行情上下单，持仓按各自 symbol 独立保存。
   */
  private async fetchMarkets(symbols: string[]): Promise<Record<string, MarketSnapshot>> {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (!unique.length) return {};

    const groups: Record<'okx' | 'binance' | 'coinbase', { futures: string[]; spot: string[] }> = {
      okx: { futures: [], spot: [] },
      binance: { futures: [], spot: [] },
      coinbase: { futures: [], spot: [] },
    };
    for (const symbol of unique) {
      const exchange = this.inferExchange(symbol);
      if (this.isSpotSymbol(symbol)) {
        groups[exchange].spot.push(symbol);
      } else {
        groups[exchange].futures.push(symbol);
      }
    }

    const now = Date.now();
    for (const exchange of ['okx', 'binance', 'coinbase'] as const) {
      const group = groups[exchange];
      try {
        if (group.futures.length) {
          const tickers = (await this.marketService.getTickers(group.futures, exchange)) as OkxTickerLike[];
          for (const ticker of tickers || []) {
            const market = this.toMarket(ticker, now);
            if (market) this.priceCache.set(market.symbol, { market, ts: now });
          }
        }
        if (group.spot.length) {
          const tickers = (await this.marketService.getSpotTickers(group.spot, exchange)) as OkxTickerLike[];
          for (const ticker of tickers || []) {
            const market = this.toMarket(ticker, now);
            if (market) this.priceCache.set(market.symbol, { market, ts: now });
          }
        }
      } catch (error) {
        this.logger.warn(`拉取 ${exchange} 行情失败，将使用最近缓存: ${(error as Error).message}`);
      }
    }

    const result: Record<string, MarketSnapshot> = {};
    for (const symbol of unique) {
      const cached = this.priceCache.get(symbol);
      if (cached && now - cached.ts <= PRICE_CACHE_TTL_MS) {
        result[symbol] = cached.market;
      }
    }
    return result;
  }

  private isSpotSymbol(symbol: string): boolean {
    const value = String(symbol || '').toUpperCase();
    if (value.endsWith('-USDT-SWAP')) return false;
    if (value.endsWith('-USDT')) return true;
    if (value.endsWith('-USD') || value.endsWith('-USDC')) return true;
    // Binance 现货和永续共用 BTCUSDT 这类无连字符格式，暂按合约行情处理。
    return false;
  }

  private inferExchange(symbol: string): 'okx' | 'binance' | 'coinbase' {
    const value = String(symbol || '').toUpperCase();
    if (value.endsWith('-USD') || value.endsWith('-USDC')) return 'coinbase';
    if (!value.includes('-')) return 'binance';
    return 'okx';
  }

  private toMarket(ticker: OkxTickerLike, ts: number): MarketSnapshot | null {
    const last = Number(ticker.lastPrice);
    const mark = Number(ticker.markPrice) || last;
    if (!Number.isFinite(mark) || mark <= 0) return null;

    const lastPrice = Number.isFinite(last) && last > 0 ? last : mark;
    const bid = Number(ticker.bidPrice);
    const ask = Number(ticker.askPrice);

    return {
      symbol: ticker.symbol,
      markPrice: round(mark, 8),
      lastPrice: round(lastPrice, 8),
      bidPrice: round(Number.isFinite(bid) && bid > 0 ? bid : lastPrice, 8),
      askPrice: round(Number.isFinite(ask) && ask > 0 ? ask : lastPrice, 8),
      ts,
    };
  }

  // ---------------------------------------------------------------- 持久化

  private loadState(filePath: string): SimAccountState | undefined {
    try {
      if (!fs.existsSync(filePath)) return undefined;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (parsed?.version === 2 && parsed.account) {
        return this.rebaseAccount(parsed.account as SimAccountState, filePath);
      }

      if (parsed && Array.isArray(parsed.orders)) {
        const migrated = this.rebaseAccount(this.migrateLegacy(parsed), filePath);
        this.logger.warn('检测到旧版模拟盘数据，已迁移到 v2 账务模型');
        return migrated;
      }

      throw new Error('未知的数据格式');
    } catch (error) {
      this.logger.error(`加载模拟盘数据失败: ${(error as Error).message}`);
      this.backupCorruptFile(filePath);
      return undefined;
    }
  }

  private migrateLegacy(raw: any): SimAccountState {
    const now = new Date().toISOString();
    const base = createInitialState(Number(raw.walletBalance) || 100000);
    base.walletBalance = round(Number(raw.walletBalance) || 100000, 2);

    base.positions = (Array.isArray(raw.positions) ? raw.positions : [])
      .map((entry: any) => {
        const p = entry?.value || entry;
        const qty = Number(p?.qty) || 0;
        const entryPrice = Number(p?.entryPrice) || 0;
        const leverage = Math.max(1, Math.round(Number(p?.leverage) || 1));
        return {
          id: p?.id || `pos_${base.nextPositionId++}`,
          symbol: p?.symbol || '',
          side: p?.side === 'short' ? 'short' : 'long',
          leverage,
          qty: round(qty, 8),
          entryPrice: round(entryPrice, 8),
          margin: round((qty * entryPrice) / leverage, 8),
          realizedPnl: 0,
          takeProfitPrice: null,
          stopLossPrice: null,
          status: 'open' as const,
          openedAt: p?.createdAt || now,
          updatedAt: now,
          closedAt: null,
        };
      })
      .filter((p: any) => p.symbol && p.qty > 0 && p.entryPrice > 0);

    base.orders = (Array.isArray(raw.orders) ? raw.orders : []).map((o: any) => {
      const qty = round(Number(o?.qty) || 0, 8);
      const price = o?.price == null || o.price === '' ? null : round(Number(o.price), 8);
      const status = ['pending', 'filled', 'cancelled'].includes(o?.status) ? o.status : 'cancelled';
      return {
        orderId: o?.orderId || `ord_${base.nextOrderId++}`,
        symbol: o?.symbol || '',
        side: o?.side === 'short' ? 'short' : 'long',
        action: o?.action === 'close' ? 'close' : 'open',
        orderType: o?.orderType === 'limit' ? 'limit' : 'market',
        leverage: Math.max(1, Math.round(Number(o?.leverage) || 1)),
        qty,
        price,
        status,
        filledQty: status === 'filled' ? qty : 0,
        avgFillPrice: o?.avgFillPrice == null ? null : round(Number(o.avgFillPrice), 8),
        fee: round(Number(o?.fee) || 0, 8),
        reservedMargin: 0,
        reduceOnly: o?.action === 'close',
        takeProfitPrice: o?.takeProfitPrice == null ? null : round(Number(o.takeProfitPrice), 8),
        stopLossPrice: o?.stopLossPrice == null ? null : round(Number(o.stopLossPrice), 8),
        source: 'user' as const,
        positionId: null,
        rejectReason: null,
        createdAt: o?.createdAt || now,
        updatedAt: now,
        filledAt: status === 'filled' ? o?.createdAt || now : null,
      };
    });

    if (raw.nextOrdId) base.nextOrderId = Math.max(base.nextOrderId, Number(raw.nextOrdId));
    if (raw.nextPosId) base.nextPositionId = Math.max(base.nextPositionId, Number(raw.nextPosId));

    base.ledger = [
      {
        id: 'ledger_1001',
        type: 'deposit',
        amount: base.walletBalance,
        balanceAfter: base.walletBalance,
        remark: '迁移旧版模拟盘数据',
        createdAt: now,
      },
    ];
    base.equityHistory = [{ ts: Date.now(), equity: base.walletBalance }];
    base.nextLedgerId = 1002;
    base.updatedAt = now;
    return base;
  }

  // 旧账户以 100,000 为初始资金；这里一次性等比例换算到 8,000 基准。
  // 只缩放数量/金额，不改价格、杠杆、订单号和时间，收益率保持不变。
  private rebaseAccount(account: SimAccountState, filePath: string): SimAccountState {
    const target = round(DEFAULT_ENGINE_CONFIG.initialWallet, 2);
    const current = Number(account.initialCapital) || this.detectInitialCapital(account);

    if (!Number.isFinite(current) || current <= 0) {
      account.initialCapital = target;
      this.capitalRebased = true;
      return account;
    }

    if (Math.abs(current - target) < 1e-9) {
      if (Number(account.initialCapital) !== target) {
        account.initialCapital = target;
        this.capitalRebased = true;
      }
      return account;
    }

    const factor = target / current;
    if (!Number.isFinite(factor) || factor <= 0) {
      account.initialCapital = target;
      this.capitalRebased = true;
      return account;
    }

    this.backupBeforeRebase(filePath);
    const scaleMoney = (value: number) => round((Number(value) || 0) * factor, 8);
    const scaleQty = (value: number) => round((Number(value) || 0) * factor, 8);

    account.walletBalance = scaleMoney(account.walletBalance);
    account.realizedPnl = scaleMoney(account.realizedPnl);
    account.contractRealizedPnl = scaleMoney(account.contractRealizedPnl);
    account.spotRealizedPnl = scaleMoney(account.spotRealizedPnl);
    account.predictionRealizedPnl = scaleMoney(account.predictionRealizedPnl);
    account.totalFee = scaleMoney(account.totalFee);

    for (const position of account.positions) {
      position.qty = scaleQty(position.qty);
      position.margin = scaleMoney(position.margin);
      position.realizedPnl = scaleMoney(position.realizedPnl);
    }

    for (const order of account.orders) {
      order.qty = scaleQty(order.qty);
      order.filledQty = scaleQty(order.filledQty);
      order.fee = scaleMoney(order.fee);
      order.reservedMargin = scaleMoney(order.reservedMargin);
    }

    account.spotHoldings = Array.isArray(account.spotHoldings) ? account.spotHoldings : [];
    for (const holding of account.spotHoldings) {
      holding.qty = scaleQty(holding.qty);
    }

    account.spotOrders = Array.isArray(account.spotOrders) ? account.spotOrders : [];
    for (const order of account.spotOrders) {
      order.qty = scaleQty(order.qty);
      order.notional = scaleMoney(order.notional);
      order.fee = scaleMoney(order.fee);
      order.realizedPnl = scaleMoney(order.realizedPnl);
    }

    for (const position of account.predictionPositions) {
      position.qty = scaleQty(position.qty);
    }

    for (const order of account.predictionOrders) {
      order.qty = scaleQty(order.qty);
      order.notional = scaleMoney(order.notional);
      order.realizedPnl = scaleMoney(order.realizedPnl);
    }

    for (const entry of account.ledger) {
      entry.amount = scaleMoney(entry.amount);
      entry.balanceAfter = scaleMoney(entry.balanceAfter);
    }

    for (const point of account.equityHistory) {
      point.equity = scaleMoney(point.equity);
    }

    account.initialCapital = target;
    account.updatedAt = new Date().toISOString();
    this.capitalRebased = true;
    this.logger.log(`模拟账户已按 ${target} USDT 初始资金等比例换算，系数 ${factor.toFixed(6)}`);
    return account;
  }

  private detectInitialCapital(account: SimAccountState): number {
    const deposit = account.ledger?.find((entry) => entry.type === 'deposit');
    if (deposit && Number(deposit.amount) > 0) return Number(deposit.amount);

    const first = account.equityHistory?.[0];
    if (first && Number(first.equity) > 0) return Number(first.equity);

    return DEFAULT_ENGINE_CONFIG.initialWallet;
  }

  private backupBeforeRebase(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const backup = `${filePath}.before-rebase-${Date.now()}.json`;
      fs.copyFileSync(filePath, backup);
      this.logger.warn(`已备份换算前的模拟盘数据到 ${backup}`);
    } catch (error) {
      this.logger.error(`备份换算前数据失败: ${(error as Error).message}`);
    }
  }

  private backupCorruptFile(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const backup = `${filePath}.corrupt-${Date.now()}`;
      fs.renameSync(filePath, backup);
      this.logger.warn(`已备份损坏的模拟盘数据到 ${backup}`);
    } catch (error) {
      this.logger.error(`备份损坏数据失败: ${(error as Error).message}`);
    }
  }

  private save(): void {
    this.saveUser(this.context.userId());
  }

  private saveUser(userId: string): void {
    const filePath = this.engineFiles.get(userId);
    const engine = this.engines.get(userId);
    if (!filePath || !engine) return;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const payload: PersistedFile = { version: 2, account: engine.getState() };
      const json = JSON.stringify(payload, null, 2);
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, json, 'utf-8');

      try {
        fs.renameSync(tmp, filePath);
      } catch {
        // Windows 上 rename 覆盖已存在文件可能失败，退化为先删后改名。
        if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
        fs.renameSync(tmp, filePath);
      }
    } catch (error) {
      this.logger.error(`保存模拟盘数据失败: ${(error as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- 格式化

  private async getInstrumentMetaOrThrow(symbol: string) {
    const exchange = this.inferExchange(symbol);
    const meta = await this.marketService.getInstrumentMeta(symbol, exchange);
    if (!meta) {
      throw new SimulationError(SIM_ERROR.INSTRUMENT_NOT_TRADABLE, `交易对不存在：${symbol}`);
    }
    return meta;
  }

  private async validateInstrumentOrder(
    input: SimulationOrderInput,
    market: MarketSnapshot,
    meta: Awaited<ReturnType<MarketService['getInstrumentMeta']>>,
  ): Promise<void> {
    if (!meta) {
      throw new SimulationError(SIM_ERROR.INSTRUMENT_NOT_TRADABLE, `交易对不存在：${input.symbol}`);
    }
    if (meta.tradable === false || (meta.status && meta.status !== 'live')) {
      throw new SimulationError(
        SIM_ERROR.INSTRUMENT_NOT_TRADABLE,
        `${input.symbol} 当前不可交易（状态：${meta.status || 'offline'}）`,
      );
    }
    if (input.mode && input.mode !== 'simulation') {
      throw new SimulationError(SIM_ERROR.MODE_NOT_ALLOWED, '当前模式不允许模拟盘下单');
    }
    if (
      input.mode &&
      Array.isArray(meta.tradableModes) &&
      !meta.tradableModes.includes(input.mode as 'simulation' | 'live')
    ) {
      throw new SimulationError(
        SIM_ERROR.MODE_NOT_ALLOWED,
        `${input.symbol} 不支持 ${input.mode} 模式`,
      );
    }

    const qty = Number(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new SimulationError(SIM_ERROR.INVALID_QTY, '下单数量必须大于 0');
    }
    const qtyPrecision = Math.max(0, Number(meta.qtyPrecision) || 0);
    if (this.decimalPlaces(input.qty) > qtyPrecision) {
      throw new SimulationError(
        SIM_ERROR.INVALID_QTY,
        `数量精度最多 ${qtyPrecision} 位小数`,
      );
    }
    const minQty = Math.max(0, Number(meta.minQty) || 0);
    if (minQty > 0 && qty + 1e-12 < minQty) {
      throw new SimulationError(
        SIM_ERROR.INVALID_QTY,
        `数量低于最小下单量 ${minQty} ${meta.baseCoin || ''}`.trim(),
      );
    }

    let referencePrice = Number(market.lastPrice || market.markPrice);
    if (input.orderType === 'limit') {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new SimulationError(SIM_ERROR.INVALID_PRICE, '限价单价格必须大于 0');
      }
      const pricePrecision = Math.max(0, Number(meta.pricePrecision) || 0);
      if (this.decimalPlaces(input.price as string | number) > pricePrecision) {
        throw new SimulationError(
          SIM_ERROR.INVALID_PRICE,
          `价格精度最多 ${pricePrecision} 位小数`,
        );
      }
      referencePrice = price;
    }

    const notional = qty * referencePrice;
    const configuredMinNotional = Math.max(0, Number(meta.minNotional) || 0);
    const dynamicMinNotional = minQty * referencePrice;
    const minNotional = Math.max(configuredMinNotional, dynamicMinNotional);
    if (minNotional > 0 && notional + 1e-8 < minNotional) {
      throw new SimulationError(
        SIM_ERROR.MIN_NOTIONAL,
        `名义价值 ${notional.toFixed(2)} USDT 低于最小名义价值 ${minNotional.toFixed(2)} USDT`,
      );
    }

    const leverage = Number(input.leverage ?? 1);
    if (Number.isFinite(leverage) && leverage > Number(meta.maxLeverage || 1)) {
      throw new SimulationError(
        SIM_ERROR.LEVERAGE_LIMIT,
        `${input.symbol} 最大杠杆 ${meta.maxLeverage}x`,
      );
    }
  }

  private decimalPlaces(value: string | number): number {
    const text = String(value ?? '').trim();
    if (!text || text.includes('e') || text.includes('E')) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return 0;
      return (String(numeric).split('.')[1] || '').length;
    }
    const decimals = text.split('.')[1];
    return decimals ? decimals.length : 0;
  }

  private assertSimulationMode(mode?: string): void {
    if (mode && mode !== 'simulation') {
      throw new SimulationError(SIM_ERROR.MODE_NOT_ALLOWED, '当前模式不允许模拟盘下单');
    }
  }

  private publishRealtime(
    userId: string,
    markets: Record<string, MarketSnapshot> = {},
  ): void {
    try {
      const engine = this.getEngine(userId);
      this.accountEvents.emitSnapshot(userId, {
        account: { ...this.toAccount(engine.snapshot(markets)), source: 'simulation' },
        positions: engine.listPositions(markets).map((position) => this.toPosition(position)),
        orders: engine.getOrderSnapshots('open').map((order) => this.toOrder(order)),
        history: engine
          .getOrderSnapshots('history')
          .slice(0, 30)
          .map((order) => this.toOrder(order)),
      });
    } catch (error) {
      this.logger.warn(`推送账户快照失败[${userId}]: ${(error as Error).message}`);
    }
  }

  private toAccount(snapshot: AccountSnapshot): Record<string, unknown> {
    return {
      mode: 'simulation',
      currency: 'USDT',
      walletBalance: this.money(snapshot.walletBalance),
      availableBalance: this.money(snapshot.availableBalance),
      positionMargin: this.money(snapshot.positionMargin),
      orderMargin: this.money(snapshot.orderMargin),
      contractPnl: this.money(snapshot.contractPnl),
      unrealizedPnl: this.money(snapshot.unrealizedPnl),
      totalUnrealizedPnl: this.money(snapshot.totalUnrealizedPnl),
      realizedPnl: this.money(snapshot.realizedPnl),
      contractRealizedPnl: this.money(snapshot.contractRealizedPnl),
      spotRealizedPnl: this.money(snapshot.spotRealizedPnl),
      predictionRealizedPnl: this.money(snapshot.predictionRealizedPnl),
      equity: this.money(snapshot.equity),
      totalFee: this.money(snapshot.totalFee),
      spotCost: this.money(snapshot.spotCost),
      spotValue: this.money(snapshot.spotValue),
      spotUnrealizedPnl: this.money(snapshot.spotUnrealizedPnl),
      predictionCost: this.money(snapshot.predictionCost),
      predictionValue: this.money(snapshot.predictionValue),
      predictionUnrealizedPnl: this.money(snapshot.predictionUnrealizedPnl),
      updatedAt: snapshot.updatedAt,
    };
  }

  private toPosition(position: PositionSnapshot): Record<string, unknown> {
    return {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      leverage: position.leverage,
      qty: this.qty(position.qty),
      entryPrice: this.price(position.entryPrice),
      markPrice: this.price(position.markPrice),
      lastPrice: this.price(position.lastPrice),
      notional: this.money(position.notional),
      initialMargin: this.money(position.initialMargin),
      maintenanceMargin: this.money(position.maintenanceMargin),
      liquidationPrice: this.price(position.liquidationPrice),
      isolatedMargin: this.money(position.isolatedMargin),
      unrealizedPnl: this.money(position.unrealizedPnl),
      realizedPnl: this.money(position.realizedPnl),
      // 接口返回小数，前端展示时再 ×100；不要在这里返回百分数。
      roe: position.roe.toFixed(6),
      takeProfitPrice: position.takeProfitPrice == null ? undefined : this.price(position.takeProfitPrice),
      stopLossPrice: position.stopLossPrice == null ? undefined : this.price(position.stopLossPrice),
      status: position.status,
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
    };
  }

  private toOrder(order: OrderSnapshot): Record<string, unknown> {
    return {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      action: order.action,
      orderType: order.orderType,
      leverage: order.leverage,
      qty: this.qty(order.qty),
      price: order.price == null ? null : this.price(order.price),
      avgFillPrice: order.avgFillPrice == null ? null : this.price(order.avgFillPrice),
      filledQty: this.qty(order.filledQty),
      notional: this.money(order.notional),
      fee: this.amount(order.fee),
      status: order.status,
      reduceOnly: order.reduceOnly,
      source: order.source,
      takeProfitPrice: order.takeProfitPrice == null ? undefined : this.price(order.takeProfitPrice),
      stopLossPrice: order.stopLossPrice == null ? undefined : this.price(order.stopLossPrice),
      rejectReason: order.rejectReason || undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      filledAt: order.filledAt || undefined,
    };
  }

  private toSpotHolding(holding: SpotHoldingSnapshot): Record<string, unknown> {
    return {
      id: holding.id,
      symbol: holding.symbol,
      baseCoin: holding.baseCoin,
      qty: this.qty(holding.qty),
      avgCost: this.price(holding.avgCost),
      markPrice: this.price(holding.markPrice),
      costBasis: this.money(holding.costBasis),
      currentValue: this.money(holding.currentValue),
      unrealizedPnl: this.money(holding.unrealizedPnl),
      roe: holding.roe.toFixed(6),
      updatedAt: holding.updatedAt,
    };
  }

  private toSpotOrder(order: SpotOrderSnapshot): Record<string, unknown> {
    return {
      orderId: order.orderId,
      symbol: order.symbol,
      baseCoin: order.baseCoin,
      side: order.side,
      qty: this.qty(order.qty),
      price: this.price(order.price),
      notional: this.money(order.notional),
      fee: this.amount(order.fee),
      realizedPnl: this.money(order.realizedPnl),
      status: order.status,
      createdAt: order.createdAt,
    };
  }

  private toSpotResult(result: SpotTradeResult): Record<string, unknown> {
    return {
      order: this.toSpotOrder(result.order),
      holding: result.holding
        ? {
            id: result.holding.id,
            symbol: result.holding.symbol,
            baseCoin: result.holding.baseCoin,
            qty: this.qty(result.holding.qty),
            avgCost: this.price(result.holding.avgCost),
            openedAt: result.holding.openedAt,
            updatedAt: result.holding.updatedAt,
          }
        : undefined,
    };
  }

  private toPredictionPosition(position: PredictionPositionSnapshot): Record<string, unknown> {
    return {
      id: position.id,
      slug: position.slug,
      marketId: position.marketId,
      question: position.question,
      eventTitle: position.eventTitle,
      icon: position.icon,
      outcome: position.outcome,
      outcomeName: position.outcomeName,
      qty: this.qty(position.qty),
      entryPrice: this.price(position.entryPrice),
      markPrice: this.price(position.markPrice),
      costBasis: this.money(position.costBasis),
      currentValue: this.money(position.currentValue),
      unrealizedPnl: this.money(position.unrealizedPnl),
      roe: position.roe.toFixed(6),
      status: position.status,
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
    };
  }

  private toPredictionOrder(order: PredictionOrderSnapshot): Record<string, unknown> {
    return {
      orderId: order.orderId,
      slug: order.slug,
      marketId: order.marketId,
      question: order.question,
      outcome: order.outcome,
      outcomeName: order.outcomeName,
      action: order.action,
      qty: this.qty(order.qty),
      price: this.price(order.price),
      notional: this.money(order.notional),
      realizedPnl: this.money(order.realizedPnl),
      status: order.status,
      positionId: order.positionId,
      createdAt: order.createdAt,
    };
  }

  private toPredictionResult(result: PredictionPlaceResult): Record<string, unknown> {
    return {
      orderId: result.order.orderId,
      status: result.order.status,
      price: this.price(result.order.price),
      qty: this.qty(result.order.qty),
      notional: this.money(result.order.notional),
      realizedPnl: this.money(result.order.realizedPnl),
      positionId: result.position?.id || result.order.positionId || undefined,
      order: this.toPredictionOrder({
        orderId: result.order.orderId,
        slug: result.order.slug,
        marketId: result.order.marketId,
        question: result.order.question,
        outcome: result.order.outcome,
        outcomeName: result.order.outcomeName,
        action: result.order.action,
        qty: result.order.qty,
        price: result.order.price,
        notional: result.order.notional,
        realizedPnl: result.order.realizedPnl,
        status: result.order.status,
        positionId: result.order.positionId,
        createdAt: result.order.createdAt,
      }),
    };
  }

  private toPreview(preview: PreviewResult): Record<string, unknown> {
    return {
      symbol: preview.symbol,
      side: preview.side,
      action: preview.action,
      orderType: preview.orderType,
      leverage: preview.leverage,
      qty: this.qty(preview.qty),
      markPrice: this.price(preview.markPrice),
      price: this.price(preview.price),
      estimatedNotional: this.money(preview.notional),
      estimatedMargin: this.money(preview.margin),
      estimatedFee: this.amount(preview.fee),
      estimatedLiquidationPrice: this.price(preview.liquidationPrice),
      maxQty: this.qty(preview.maxQty),
      availableBalance: this.money(preview.availableBalance),
    };
  }

  private toPlaceOrderResult(result: PlaceOrderResult): Record<string, unknown> {
    return {
      orderId: result.order.orderId,
      status: result.order.status,
      avgFillPrice: result.order.avgFillPrice == null ? null : this.price(result.order.avgFillPrice),
      filledQty: this.qty(result.order.filledQty),
      fee: this.amount(result.order.fee),
      positionId: result.position?.id || result.order.positionId || undefined,
      rejectReason: result.order.rejectReason || undefined,
      order: this.toOrder(this.toOrderSnapshot(result.order)),
    };
  }

  private toLedger(entry: SimLedgerEntry): Record<string, unknown> {
    return {
      id: entry.id,
      type: entry.type,
      amount: this.amount(entry.amount),
      balanceAfter: this.money(entry.balanceAfter),
      symbol: entry.symbol || '',
      orderId: entry.orderId,
      positionId: entry.positionId,
      remark: entry.remark,
      createdAt: entry.createdAt,
    };
  }

  private toOrderSnapshot(order: SimOrder): OrderSnapshot {
    // 引擎的 toOrderSnapshot 是 private，这里只给 cancel 的返回值使用一个轻量映射。
    return {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      action: order.action,
      orderType: order.orderType,
      leverage: order.leverage,
      qty: order.qty,
      price: order.price,
      avgFillPrice: order.avgFillPrice,
      filledQty: order.filledQty,
      notional: order.filledQty * (order.avgFillPrice || order.price || 0),
      fee: order.fee,
      status: order.status,
      reduceOnly: order.reduceOnly,
      source: order.source,
      takeProfitPrice: order.takeProfitPrice,
      stopLossPrice: order.stopLossPrice,
      rejectReason: order.rejectReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      filledAt: order.filledAt,
    };
  }

  private money(value: number): string {
    return (Number(value) || 0).toFixed(2);
  }

  private amount(value: number): string {
    return this.trim(Number(value) || 0, 8);
  }

  private price(value: number): string {
    return this.trim(Number(value) || 0, 8);
  }

  private qty(value: number): string {
    return this.trim(Number(value) || 0, 8);
  }

  private trim(value: number, digits: number): string {
    const fixed = value.toFixed(digits);
    return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
}
