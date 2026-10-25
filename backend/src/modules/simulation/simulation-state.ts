import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MarketService } from '../market/market.service';
import { createInitialState, round, SimulationEngine } from './simulation-engine';
import {
  AccountSnapshot,
  EquityPoint,
  MarketSnapshot,
  OrderSnapshot,
  PlaceOrderResult,
  PositionSnapshot,
  PreviewResult,
  SIM_ERROR,
  SimAccountState,
  SimLedgerEntry,
  SimOrder,
  SimulationError,
  SimulationOrderInput,
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
  private readonly filePath: string;
  private readonly engine: SimulationEngine;
  private readonly priceCache = new Map<string, CachedMarket>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly marketService: MarketService) {
    this.filePath = path.resolve(__dirname, '../../../data/simulation.json');
    const loaded = this.loadState();
    this.engine = new SimulationEngine(loaded);
    const state = this.engine.getState();
    this.logger.log(
      `模拟盘已加载：钱包 ${state.walletBalance.toFixed(2)} USDT，持仓 ${state.positions.length} 个，委托 ${state.orders.filter((o) => o.status === 'pending').length} 笔`,
    );
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.save();
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
    this.assertSimulationMode(input.mode);
    const market = await this.requireMarket(input.symbol);
    const preview = this.engine.preview(input, market);
    return this.toPreview(preview);
  }

  async placeOrder(input: SimulationOrderInput): Promise<Record<string, unknown>> {
    this.assertSimulationMode(input.mode);
    const market = await this.requireMarket(input.symbol);

    try {
      const result = this.engine.placeOrder(input, market);
      this.save();
      return this.toPlaceOrderResult(result);
    } catch (error) {
      // 失败的下单也会留下 rejected 订单，便于前端/审计看到拒绝原因。
      this.save();
      throw error;
    }
  }

  cancelOrder(orderId: string): Record<string, unknown> {
    const order = this.engine.cancelOrder(orderId);
    this.save();
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
    try {
      const result = this.engine.closePosition(resolvedId, qty, market);
      this.save();
      return this.toPlaceOrderResult(result);
    } catch (error) {
      this.save();
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
    const position = this.engine.listPositions({}).find((p) => p.id === positionId);
    return position ? this.toPosition(position) : { positionId, status: 'updated' };
  }

  reset(): Record<string, unknown> {
    const snapshot = this.engine.reset();
    this.save();
    return this.toAccount(snapshot);
  }

  // ---------------------------------------------------------------- 行情与后台撮合

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const symbols = this.engine.trackedSymbols();
      if (!symbols.length) return;

      const markets = await this.fetchMarkets(symbols);
      const result = this.engine.processMarkets(markets);
      if (result.changed) {
        this.save();
        for (const event of result.events) this.logger.log(event);
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
   * 批量拉取行情。OKX 的 tickers 接口一次返回全量，指定 symbols 只是本地过滤，
   * 因此这里一次请求即可覆盖所有持仓/挂单，避免逐个 symbol 请求造成 N+1。
   */
  private async fetchMarkets(symbols: string[]): Promise<Record<string, MarketSnapshot>> {
    const unique = Array.from(new Set(symbols.filter(Boolean)));
    if (!unique.length) return {};

    let tickers: OkxTickerLike[] = [];
    try {
      tickers = (await this.marketService.getTickers(unique, 'okx')) as OkxTickerLike[];
    } catch (error) {
      this.logger.warn(`拉取 OKX 行情失败，将使用最近缓存: ${(error as Error).message}`);
    }

    const now = Date.now();
    for (const ticker of tickers || []) {
      const market = this.toMarket(ticker, now);
      if (market) this.priceCache.set(market.symbol, { market, ts: now });
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

  private loadState(): SimAccountState | undefined {
    try {
      if (!fs.existsSync(this.filePath)) return undefined;

      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (parsed?.version === 2 && parsed.account) {
        return parsed.account as SimAccountState;
      }

      if (parsed && Array.isArray(parsed.orders)) {
        const migrated = this.migrateLegacy(parsed);
        this.logger.warn('检测到旧版模拟盘数据，已迁移到 v2 账务模型');
        return migrated;
      }

      throw new Error('未知的数据格式');
    } catch (error) {
      this.logger.error(`加载模拟盘数据失败: ${(error as Error).message}`);
      this.backupCorruptFile();
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

  private backupCorruptFile(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      fs.renameSync(this.filePath, backup);
      this.logger.warn(`已备份损坏的模拟盘数据到 ${backup}`);
    } catch (error) {
      this.logger.error(`备份损坏数据失败: ${(error as Error).message}`);
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const payload: PersistedFile = { version: 2, account: this.engine.getState() };
      const json = JSON.stringify(payload, null, 2);
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, json, 'utf-8');

      try {
        fs.renameSync(tmp, this.filePath);
      } catch {
        // Windows 上 rename 覆盖已存在文件可能失败，退化为先删后改名。
        if (fs.existsSync(this.filePath)) fs.rmSync(this.filePath, { force: true });
        fs.renameSync(tmp, this.filePath);
      }
    } catch (error) {
      this.logger.error(`保存模拟盘数据失败: ${(error as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- 格式化

  private assertSimulationMode(mode?: string): void {
    if (mode && mode !== 'simulation') {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '模拟盘接口不支持实盘模式');
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
      unrealizedPnl: this.money(snapshot.unrealizedPnl),
      realizedPnl: this.money(snapshot.realizedPnl),
      equity: this.money(snapshot.equity),
      totalFee: this.money(snapshot.totalFee),
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
