import {
  AccountSnapshot,
  DEFAULT_ENGINE_CONFIG,
  EngineConfig,
  EquityPoint,
  MarketSnapshot,
  OrderSnapshot,
  PlaceOrderResult,
  PositionSnapshot,
  PreviewResult,
  ProcessResult,
  SIM_ERROR,
  SimAccountState,
  SimLedgerEntry,
  SimLedgerType,
  SimOrder,
  SimOrderSource,
  SimOrderStatus,
  SimPosition,
  SimulationError,
  SimulationOrderInput,
} from './simulation.types';

const EPS = 1e-9;
const MAX_HISTORY = 5000;
const MAX_LEDGER = 5000;
const EQUITY_INTERVAL_MS = 60_000;

export function round(value: number, digits = 8): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function floor(value: number, digits = 8): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** digits;
  return Math.floor(value * factor) / factor;
}

function iso(): string {
  return new Date().toISOString();
}

export function createInitialState(initialWallet = DEFAULT_ENGINE_CONFIG.initialWallet): SimAccountState {
  const now = iso();
  return {
    version: 2,
    walletBalance: round(initialWallet, 2),
    realizedPnl: 0,
    totalFee: 0,
    positions: [],
    orders: [],
    ledger: [
      {
        id: 'ledger_1001',
        type: 'deposit',
        amount: round(initialWallet, 2),
        balanceAfter: round(initialWallet, 2),
        remark: '初始模拟资金',
        createdAt: now,
      },
    ],
    equityHistory: [{ ts: Date.now(), equity: round(initialWallet, 2) }],
    nextOrderId: 1001,
    nextPositionId: 1001,
    nextLedgerId: 1002,
    updatedAt: now,
  };
}

function normalizeState(input: SimAccountState, config: EngineConfig): SimAccountState {
  const fallback = createInitialState(config.initialWallet);
  const now = iso();
  const positions = Array.isArray(input.positions)
    ? input.positions
        .filter((p) => p && p.status !== 'closed' && p.status !== 'liquidated')
        .map<SimPosition>((p) => {
          const qty = round(Number(p.qty) || 0);
          const entryPrice = round(Number(p.entryPrice) || 0);
          const leverage = Math.max(1, Math.round(Number(p.leverage) || 1));
          return {
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            leverage,
            qty,
            entryPrice,
            margin: round(Number(p.margin) || (qty * entryPrice) / leverage),
            realizedPnl: round(Number(p.realizedPnl) || 0),
            takeProfitPrice: p.takeProfitPrice == null ? null : round(Number(p.takeProfitPrice)),
            stopLossPrice: p.stopLossPrice == null ? null : round(Number(p.stopLossPrice)),
            status: 'open',
            openedAt: p.openedAt || now,
            updatedAt: p.updatedAt || now,
            closedAt: null,
          };
        })
        .filter((p) => p.qty > EPS && p.entryPrice > 0)
    : [];

  const orders = Array.isArray(input.orders)
    ? input.orders.map<SimOrder>((o) => ({
        ...o,
        qty: round(Number(o.qty) || 0),
        price: o.price == null ? null : round(Number(o.price)),
        filledQty: round(Number(o.filledQty) || 0),
        avgFillPrice: o.avgFillPrice == null ? null : round(Number(o.avgFillPrice)),
        fee: round(Number(o.fee) || 0),
        reservedMargin: round(Number(o.reservedMargin) || 0),
        takeProfitPrice: o.takeProfitPrice == null ? null : round(Number(o.takeProfitPrice)),
        stopLossPrice: o.stopLossPrice == null ? null : round(Number(o.stopLossPrice)),
        createdAt: o.createdAt || now,
        updatedAt: o.updatedAt || now,
      }))
    : [];

  return {
    version: 2,
    walletBalance: round(Number(input.walletBalance) || fallback.walletBalance, 2),
    realizedPnl: round(Number(input.realizedPnl) || 0),
    totalFee: round(Number(input.totalFee) || 0),
    positions,
    orders,
    ledger: Array.isArray(input.ledger) && input.ledger.length ? input.ledger : fallback.ledger,
    equityHistory:
      Array.isArray(input.equityHistory) && input.equityHistory.length
        ? input.equityHistory
            .map((p) => ({ ts: Number(p.ts) || Date.now(), equity: round(Number(p.equity) || 0) }))
            .slice(-MAX_HISTORY)
        : fallback.equityHistory,
    nextOrderId: Math.max(1001, Number(input.nextOrderId) || 1001),
    nextPositionId: Math.max(1001, Number(input.nextPositionId) || 1001),
    nextLedgerId: Math.max(1002, Number(input.nextLedgerId) || 1002),
    updatedAt: input.updatedAt || now,
  };
}

/**
 * 纯模拟盘账务引擎。
 *
 * 不依赖 Nest、文件系统或网络，便于直接跑自测。
 *
 * 账务模型：
 *   available = walletBalance - Σ position.margin - Σ pendingOpen.reservedMargin
 *   equity    = walletBalance + unrealizedPnl
 *   walletBalance 在开/平仓时只扣手续费、加减已实现盈亏，不重复扣保证金。
 */
export class SimulationEngine {
  private state: SimAccountState;
  private readonly config: EngineConfig;

  constructor(state?: SimAccountState, config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...(config || {}) };
    this.state = state ? normalizeState(state, this.config) : createInitialState(this.config.initialWallet);
  }

  getState(): SimAccountState {
    return this.state;
  }

  getConfig(): EngineConfig {
    return this.config;
  }

  // ---------------------------------------------------------------- 账户视图

  snapshot(markets: Record<string, MarketSnapshot> = {}): AccountSnapshot {
    let unrealizedPnl = 0;
    let positionMargin = 0;

    for (const position of this.openPositions()) {
      const mark = this.markPrice(position, markets);
      unrealizedPnl += this.pnl(position, mark);
      positionMargin += position.margin;
    }

    const orderMargin = this.orderMargin();
    const walletBalance = round(this.state.walletBalance, 8);
    let availableBalance = round(walletBalance - positionMargin - orderMargin, 8);
    if (Math.abs(availableBalance) < EPS) availableBalance = 0;

    return {
      walletBalance,
      availableBalance,
      positionMargin: round(positionMargin, 8),
      orderMargin: round(orderMargin, 8),
      unrealizedPnl: round(unrealizedPnl, 8),
      realizedPnl: round(this.state.realizedPnl, 8),
      equity: round(walletBalance + unrealizedPnl, 8),
      totalFee: round(this.state.totalFee, 8),
      updatedAt: this.state.updatedAt,
    };
  }

  listPositions(markets: Record<string, MarketSnapshot> = {}): PositionSnapshot[] {
    return this.openPositions()
      .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
      .map((position) => {
        const mark = this.markPrice(position, markets);
        const last = this.lastPrice(position, markets);
        const pnl = this.pnl(position, mark);
        return {
          id: position.id,
          symbol: position.symbol,
          side: position.side,
          leverage: position.leverage,
          qty: position.qty,
          entryPrice: position.entryPrice,
          markPrice: mark,
          lastPrice: last,
          notional: round(mark * position.qty, 8),
          initialMargin: position.margin,
          maintenanceMargin: round(mark * position.qty * this.config.maintenanceMarginRate, 8),
          liquidationPrice: this.liquidationPrice(position.side, position.entryPrice, position.leverage),
          isolatedMargin: position.margin,
          unrealizedPnl: pnl,
          realizedPnl: position.realizedPnl,
          roe: position.margin > EPS ? round(pnl / position.margin, 10) : 0,
          takeProfitPrice: position.takeProfitPrice,
          stopLossPrice: position.stopLossPrice,
          status: position.status,
          createdAt: position.openedAt,
          updatedAt: position.updatedAt,
        };
      });
  }

  getOrderSnapshots(kind: 'open' | 'history' | 'fills', symbol?: string): OrderSnapshot[] {
    let list = this.state.orders;
    if (kind === 'open') list = list.filter((o) => o.status === 'pending');
    else if (kind === 'history') list = list.filter((o) => o.status !== 'pending');
    else list = list.filter((o) => o.status === 'filled');

    if (symbol) list = list.filter((o) => o.symbol === symbol);

    return [...list]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => this.toOrderSnapshot(order));
  }

  getLedger(limit = 100): SimLedgerEntry[] {
    return [...this.state.ledger].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(1, limit));
  }

  getEquityHistory(range = '30d'): EquityPoint[] {
    const days = { '1d': 1, '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[range] || 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const points = this.state.equityHistory.filter((p) => p.ts >= cutoff);

    if (points.length) {
      // 轻量图表要求时间严格递增；同一秒内的多笔成交只保留最后一笔权益。
      const bySecond = new Map<number, number>();
      for (const point of points) {
        bySecond.set(Math.floor(point.ts / 1000) * 1000, point.equity);
      }
      return Array.from(bySecond.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([ts, equity]) => ({ ts, equity }));
    }

    const current = this.snapshot();
    return [{ ts: Math.floor(Date.now() / 1000) * 1000, equity: current.equity }];
  }

  trackedSymbols(): string[] {
    const symbols = new Set<string>();
    for (const position of this.openPositions()) symbols.add(position.symbol);
    for (const order of this.state.orders) {
      if (order.status === 'pending') symbols.add(order.symbol);
    }
    return Array.from(symbols);
  }

  // ---------------------------------------------------------------- 试算

  preview(input: SimulationOrderInput, market: MarketSnapshot): PreviewResult {
    const symbol = this.parseSymbol(input.symbol);
    this.assertSide(input.side);
    this.assertAction(input.action);
    this.assertOrderType(input.orderType);

    const markPrice = this.safeMarketPrice(market);
    const available = this.availableBalance();

    if (input.action === 'close') {
      const position = this.findPosition(symbol);
      if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '当前品种没有可平仓位');
      if (position.side !== input.side) {
        throw new SimulationError(SIM_ERROR.RISK_REJECTED, '平仓方向与当前持仓不一致');
      }

      const qty = input.qty === undefined || input.qty === '' ? position.qty : this.parseQty(input.qty);
      const maxQty = this.maxCloseQty(position);
      if (qty > maxQty + EPS) {
        throw new SimulationError(SIM_ERROR.INVALID_QTY, `可平数量不足，当前最大可平 ${maxQty}`);
      }

      const price =
        input.orderType === 'limit'
          ? this.parsePrice(input.price, '委托价格')
          : this.marketFillPrice(input.side === 'long' ? 'sell' : 'buy', market, true);
      const feeRate = input.orderType === 'limit' ? this.config.makerFeeRate : this.config.takerFeeRate;
      const notional = qty * price;

      return {
        symbol,
        side: input.side,
        action: 'close',
        orderType: input.orderType,
        leverage: position.leverage,
        qty,
        markPrice,
        price,
        notional: round(notional, 8),
        margin: 0,
        fee: round(notional * feeRate, 8),
        liquidationPrice: this.liquidationPrice(position.side, position.entryPrice, position.leverage),
        maxQty,
        availableBalance: available,
      };
    }

    const leverage = this.parseLeverage(input.leverage);
    const existing = this.findPosition(symbol);
    if (existing) {
      if (existing.side !== input.side) {
        throw new SimulationError(SIM_ERROR.RISK_REJECTED, '单向持仓模式下不能同时持有多空，请先平仓');
      }
      if (existing.leverage !== leverage) {
        throw new SimulationError(SIM_ERROR.LEVERAGE_LIMIT, `加仓杠杆需与当前持仓一致（${existing.leverage}x）`);
      }
    }

    const price =
      input.orderType === 'limit'
        ? this.parsePrice(input.price, '委托价格')
        : this.marketFillPrice(input.side === 'long' ? 'buy' : 'sell', market, true);
    const feeRate = input.orderType === 'limit' ? this.config.makerFeeRate : this.config.takerFeeRate;
    const notional = price * (input.qty === undefined || input.qty === '' ? 0 : this.parseQty(input.qty));

    return {
      symbol,
      side: input.side,
      action: 'open',
      orderType: input.orderType,
      leverage,
      qty: input.qty === undefined || input.qty === '' ? 0 : this.parseQty(input.qty),
      markPrice,
      price,
      notional: round(notional, 8),
      margin: round(notional / leverage, 8),
      fee: round(notional * feeRate, 8),
      liquidationPrice: this.liquidationPrice(input.side, price, leverage),
      maxQty: this.maxOpenQty(price, leverage, feeRate),
      availableBalance: available,
    };
  }

  // ---------------------------------------------------------------- 下单/撤单/平仓

  placeOrder(input: SimulationOrderInput, market: MarketSnapshot): PlaceOrderResult {
    const symbol = this.parseSymbol(input.symbol);
    this.assertSide(input.side);
    this.assertAction(input.action);
    this.assertOrderType(input.orderType);

    const marketPrice = this.safeMarketPrice(market);
    const qty = this.parseQty(input.qty);

    if (input.action === 'open') {
      return this.placeOpenOrder(input, symbol, qty, market, marketPrice);
    }

    return this.placeCloseOrder(input, symbol, qty, market);
  }

  cancelOrder(orderId: string): SimOrder {
    const order = this.state.orders.find((o) => o.orderId === orderId);
    if (!order) throw new SimulationError(SIM_ERROR.ORDER_NOT_FOUND, '订单不存在');
    if (order.status !== 'pending') {
      throw new SimulationError(SIM_ERROR.ORDER_NOT_FOUND, `订单当前状态为 ${order.status}，无法撤单`);
    }

    order.status = 'cancelled';
    order.reservedMargin = 0;
    order.updatedAt = iso();
    this.touch();
    return order;
  }

  closePosition(
    positionId: string,
    qtyInput: string | number | undefined,
    market: MarketSnapshot,
    source: SimOrderSource = 'user',
  ): PlaceOrderResult {
    const position = this.findPositionById(positionId);
    if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '持仓不存在');

    const qty = qtyInput === undefined || qtyInput === null || qtyInput === '' ? position.qty : this.parseQty(qtyInput);
    if (qty > position.qty + EPS) {
      throw new SimulationError(SIM_ERROR.INVALID_QTY, `平仓数量不能超过持仓数量 ${position.qty}`);
    }

    const order = this.newOrder({
      symbol: position.symbol,
      side: position.side,
      action: 'close',
      orderType: 'market',
      leverage: position.leverage,
      qty,
      price: null,
      takeProfitPrice: null,
      stopLossPrice: null,
      reduceOnly: true,
      source,
    });
    order.positionId = position.id;
    this.state.orders.push(order);

    const fillPrice = this.marketFillPrice(position.side === 'long' ? 'sell' : 'buy', market, true);
    try {
      this.executeClose(order, fillPrice, 'taker', { [market.symbol]: market });
    } catch (error) {
      this.rejectOrder(order, (error as Error).message);
      throw error;
    }
    return { order, position: this.findPositionById(position.id) };
  }

  updateRisk(
    positionId: string,
    takeProfitPrice: string | number | null | undefined,
    stopLossPrice: string | number | null | undefined,
  ): SimPosition {
    const position = this.findPositionById(positionId);
    if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '持仓不存在');

    const tp = takeProfitPrice === undefined ? position.takeProfitPrice : this.optionalPrice(takeProfitPrice, '止盈价格');
    const sl = stopLossPrice === undefined ? position.stopLossPrice : this.optionalPrice(stopLossPrice, '止损价格');
    this.validateTpSl(position.side, position.entryPrice, tp, sl);

    position.takeProfitPrice = tp;
    position.stopLossPrice = sl;
    position.updatedAt = iso();
    this.touch();
    return position;
  }

  reset(): AccountSnapshot {
    const nextOrderId = this.state.nextOrderId;
    const nextPositionId = this.state.nextPositionId;
    const nextLedgerId = this.state.nextLedgerId;
    const now = iso();
    const wallet = round(this.config.initialWallet, 2);

    this.state = {
      ...createInitialState(wallet),
      nextOrderId,
      nextPositionId,
      ledger: [
        {
          id: `ledger_${nextLedgerId}`,
          type: 'deposit',
          amount: wallet,
          balanceAfter: wallet,
          remark: '重置模拟账户',
          createdAt: now,
        },
      ],
      equityHistory: [{ ts: Date.now(), equity: wallet }],
      nextLedgerId: nextLedgerId + 1,
    };

    return this.snapshot();
  }

  // ---------------------------------------------------------------- 行情驱动撮合/风控

  /**
   * 用一批最新行情驱动：限价单撮合、止盈止损、强平。
   * 只有真正发生成交/强平/权益快照时才返回 changed=true。
   */
  processMarkets(markets: Record<string, MarketSnapshot>): ProcessResult {
    const events: string[] = [];
    let changed = false;

    const pendingOrders = this.state.orders.filter((o) => o.status === 'pending');
    for (const order of pendingOrders) {
      const market = markets[order.symbol];
      if (!market) continue;
      if (!this.shouldTrigger(order, market)) continue;

      try {
        if (order.action === 'open') {
          // 挂单期间冻结了保证金 + 手续费，成交前先释放。
          order.reservedMargin = 0;
          this.executeOpen(order, this.parsePrice(order.price, '委托价格'), 'maker', markets);
          events.push(`限价开仓成交 ${order.orderId} ${order.symbol} ${order.side} ${order.qty}`);
        } else {
          const position = this.findPosition(order.symbol);
          if (!position || position.side !== order.side) {
            this.rejectOrder(order, '持仓已不存在');
            events.push(`限价平仓撤销 ${order.orderId}：持仓已不存在`);
          } else {
            this.executeClose(order, this.parsePrice(order.price, '委托价格'), 'maker', markets);
            events.push(`限价平仓成交 ${order.orderId} ${order.symbol} ${order.side} ${order.qty}`);
          }
        }
        changed = true;
      } catch (error) {
        this.rejectOrder(order, (error as Error).message);
        events.push(`限价单被拒绝 ${order.orderId}：${(error as Error).message}`);
        changed = true;
      }
    }

    // 成交/撤单后再处理持仓，避免同一 tick 内对已平仓位重复操作。
    const positions = [...this.openPositions()];
    for (const position of positions) {
      const current = this.findPositionById(position.id);
      if (!current) continue;

      const market = markets[current.symbol];
      if (!market) continue;

      const mark = this.markPrice(current, { [market.symbol]: market });
      const pnl = this.pnl(current, mark);
      const maintenance = mark * current.qty * this.config.maintenanceMarginRate;

      if (current.margin + pnl <= maintenance) {
        const order = this.newOrder({
          symbol: current.symbol,
          side: current.side,
          action: 'close',
          orderType: 'market',
          leverage: current.leverage,
          qty: current.qty,
          price: null,
          takeProfitPrice: null,
          stopLossPrice: null,
          reduceOnly: true,
          source: 'liquidation',
        });
        order.positionId = current.id;
        this.state.orders.push(order);
        const fillPrice = this.marketFillPrice(current.side === 'long' ? 'sell' : 'buy', market, true);
        try {
          this.executeClose(order, fillPrice, 'taker', markets, 'liquidation');
          events.push(`强制平仓 ${current.symbol} ${current.side} @ ${fillPrice}`);
        } catch (error) {
          this.rejectOrder(order, (error as Error).message);
          events.push(`强平失败 ${current.symbol}：${(error as Error).message}`);
        }
        changed = true;
        continue;
      }

      try {
        if (current.takeProfitPrice != null && this.tpTriggered(current, mark)) {
          this.closeByTrigger(current, market, markets, 'tp');
          events.push(`止盈触发 ${current.symbol} ${current.side} @ ${mark}`);
          changed = true;
          continue;
        }

        if (current.stopLossPrice != null && this.slTriggered(current, mark)) {
          this.closeByTrigger(current, market, markets, 'sl');
          events.push(`止损触发 ${current.symbol} ${current.side} @ ${mark}`);
          changed = true;
        }
      } catch (error) {
        events.push(`止盈止损执行失败 ${current.symbol}：${(error as Error).message}`);
        changed = true;
      }
    }

    if (this.recordEquity(markets)) changed = true;
    if (changed) this.touch();

    return { changed, events };
  }

  // ---------------------------------------------------------------- 内部：开仓/平仓

  private placeOpenOrder(
    input: SimulationOrderInput,
    symbol: string,
    qty: number,
    market: MarketSnapshot,
    marketPrice: number,
  ): PlaceOrderResult {
    const leverage = this.parseLeverage(input.leverage);
    const existing = this.findPosition(symbol);

    if (existing) {
      if (existing.side !== input.side) {
        throw new SimulationError(SIM_ERROR.RISK_REJECTED, '单向持仓模式下不能同时持有多空，请先平仓');
      }
      if (existing.leverage !== leverage) {
        throw new SimulationError(SIM_ERROR.LEVERAGE_LIMIT, `加仓杠杆需与当前持仓一致（${existing.leverage}x）`);
      }
    }

    const tp = this.optionalPrice(input.takeProfitPrice, '止盈价格');
    const sl = this.optionalPrice(input.stopLossPrice, '止损价格');

    if (input.orderType === 'market') {
      const fillPrice = this.marketFillPrice(input.side === 'long' ? 'buy' : 'sell', market, true);
      const projectedEntry = existing
        ? (existing.entryPrice * existing.qty + fillPrice * qty) / (existing.qty + qty)
        : fillPrice;
      this.validateTpSl(input.side, projectedEntry, tp, sl);
      const order = this.newOrder({
        symbol,
        side: input.side,
        action: 'open',
        orderType: 'market',
        leverage,
        qty,
        price: null,
        takeProfitPrice: tp,
        stopLossPrice: sl,
        reduceOnly: false,
        source: 'user',
      });
      this.state.orders.push(order);
      try {
        this.executeOpen(order, fillPrice, 'taker', { [market.symbol]: market });
      } catch (error) {
        this.rejectOrder(order, (error as Error).message);
        throw error;
      }
      return { order, position: this.findPosition(symbol) };
    }

    const price = this.parsePrice(input.price, '委托价格');
    const projectedEntry = existing
      ? (existing.entryPrice * existing.qty + price * qty) / (existing.qty + qty)
      : price;
    this.validateTpSl(input.side, projectedEntry, tp, sl);
    const crosses =
      input.side === 'long'
        ? price >= (market.askPrice > 0 ? market.askPrice : marketPrice)
        : price <= (market.bidPrice > 0 ? market.bidPrice : marketPrice);

    if (crosses) {
      const fillPrice = this.marketFillPrice(input.side === 'long' ? 'buy' : 'sell', market, true);
      const order = this.newOrder({
        symbol,
        side: input.side,
        action: 'open',
        orderType: 'limit',
        leverage,
        qty,
        price,
        takeProfitPrice: tp,
        stopLossPrice: sl,
        reduceOnly: false,
        source: 'user',
      });
      this.state.orders.push(order);
      try {
        this.executeOpen(order, fillPrice, 'taker', { [market.symbol]: market });
      } catch (error) {
        this.rejectOrder(order, (error as Error).message);
        throw error;
      }
      return { order, position: this.findPosition(symbol) };
    }

    const fee = qty * price * this.config.makerFeeRate;
    const margin = (qty * price) / leverage;
    const reservedMargin = round(margin + fee, 8);
    if (this.availableBalance() + EPS < reservedMargin) {
      throw new SimulationError(
        SIM_ERROR.INSUFFICIENT_BALANCE,
        `可用余额不足，需要 ${reservedMargin.toFixed(2)} USDT，当前可用 ${this.availableBalance().toFixed(2)} USDT`,
      );
    }

    const order = this.newOrder({
      symbol,
      side: input.side,
      action: 'open',
      orderType: 'limit',
      leverage,
      qty,
      price,
      takeProfitPrice: tp,
      stopLossPrice: sl,
      reduceOnly: false,
      source: 'user',
    });
    order.reservedMargin = reservedMargin;
    this.state.orders.push(order);
    this.touch();
    return { order };
  }

  private placeCloseOrder(
    input: SimulationOrderInput,
    symbol: string,
    qty: number,
    market: MarketSnapshot,
  ): PlaceOrderResult {
    const position = this.findPosition(symbol);
    if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '当前品种没有可平仓位');
    if (position.side !== input.side) {
      throw new SimulationError(SIM_ERROR.RISK_REJECTED, '平仓方向与当前持仓不一致');
    }

    const maxQty = this.maxCloseQty(position);
    if (qty > maxQty + EPS) {
      throw new SimulationError(SIM_ERROR.INVALID_QTY, `可平数量不足，当前最大可平 ${maxQty}`);
    }

    if (input.orderType === 'market') {
      const order = this.newOrder({
        symbol,
        side: input.side,
        action: 'close',
        orderType: 'market',
        leverage: position.leverage,
        qty,
        price: null,
        takeProfitPrice: null,
        stopLossPrice: null,
        reduceOnly: true,
        source: 'user',
      });
      order.positionId = position.id;
      this.state.orders.push(order);
      const fillPrice = this.marketFillPrice(input.side === 'long' ? 'sell' : 'buy', market, true);
      try {
        this.executeClose(order, fillPrice, 'taker', { [market.symbol]: market });
      } catch (error) {
        this.rejectOrder(order, (error as Error).message);
        throw error;
      }
      return { order, position: this.findPositionById(position.id) };
    }

    const price = this.parsePrice(input.price, '委托价格');
    const crosses =
      input.side === 'long'
        ? price <= (market.bidPrice > 0 ? market.bidPrice : market.markPrice)
        : price >= (market.askPrice > 0 ? market.askPrice : market.markPrice);

    if (crosses) {
      const order = this.newOrder({
        symbol,
        side: input.side,
        action: 'close',
        orderType: 'limit',
        leverage: position.leverage,
        qty,
        price,
        takeProfitPrice: null,
        stopLossPrice: null,
        reduceOnly: true,
        source: 'user',
      });
      order.positionId = position.id;
      this.state.orders.push(order);
      const fillPrice = this.marketFillPrice(input.side === 'long' ? 'sell' : 'buy', market, true);
      try {
        this.executeClose(order, fillPrice, 'taker', { [market.symbol]: market });
      } catch (error) {
        this.rejectOrder(order, (error as Error).message);
        throw error;
      }
      return { order, position: this.findPositionById(position.id) };
    }

    const order = this.newOrder({
      symbol,
      side: input.side,
      action: 'close',
      orderType: 'limit',
      leverage: position.leverage,
      qty,
      price,
      takeProfitPrice: null,
      stopLossPrice: null,
      reduceOnly: true,
      source: 'user',
    });
    order.positionId = position.id;
    this.state.orders.push(order);
    this.touch();
    return { order };
  }

  private executeOpen(
    order: SimOrder,
    fillPrice: number,
    liquidity: 'maker' | 'taker',
    markets: Record<string, MarketSnapshot>,
  ): void {
    const price = round(fillPrice, 8);
    if (price <= 0) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '成交价格无效');

    const feeRate = liquidity === 'taker' ? this.config.takerFeeRate : this.config.makerFeeRate;
    const notional = order.qty * price;
    const fee = round(notional * feeRate, 8);
    const margin = round(notional / order.leverage, 8);

    if (this.availableBalance() + EPS < margin + fee) {
      throw new SimulationError(
        SIM_ERROR.INSUFFICIENT_BALANCE,
        `可用余额不足，需要 ${(margin + fee).toFixed(2)} USDT，当前可用 ${this.availableBalance().toFixed(2)} USDT`,
      );
    }

    let position = this.findPosition(order.symbol);
    if (position) {
      if (position.side !== order.side) {
        throw new SimulationError(SIM_ERROR.RISK_REJECTED, '单向持仓模式下不能同时持有多空，请先平仓');
      }
      if (position.leverage !== order.leverage) {
        throw new SimulationError(SIM_ERROR.LEVERAGE_LIMIT, `加仓杠杆需与当前持仓一致（${position.leverage}x）`);
      }
      const projectedEntry = (position.entryPrice * position.qty + price * order.qty) / (position.qty + order.qty);
      this.validateTpSl(
        order.side,
        projectedEntry,
        order.takeProfitPrice ?? position.takeProfitPrice,
        order.stopLossPrice ?? position.stopLossPrice,
      );
      const totalQty = position.qty + order.qty;
      position.entryPrice = round(
        (position.entryPrice * position.qty + price * order.qty) / totalQty,
        8,
      );
      position.qty = round(totalQty, 8);
      position.margin = round(position.margin + margin, 8);
      position.realizedPnl = round(position.realizedPnl, 8);
      if (order.takeProfitPrice != null) position.takeProfitPrice = order.takeProfitPrice;
      if (order.stopLossPrice != null) position.stopLossPrice = order.stopLossPrice;
      position.updatedAt = iso();
    } else {
      this.validateTpSl(order.side, price, order.takeProfitPrice, order.stopLossPrice);
      position = {
        id: `pos_${this.state.nextPositionId++}`,
        symbol: order.symbol,
        side: order.side,
        leverage: order.leverage,
        qty: order.qty,
        entryPrice: price,
        margin,
        realizedPnl: 0,
        takeProfitPrice: order.takeProfitPrice,
        stopLossPrice: order.stopLossPrice,
        status: 'open',
        openedAt: iso(),
        updatedAt: iso(),
        closedAt: null,
      };
      this.state.positions.push(position);
    }

    this.state.walletBalance = round(this.state.walletBalance - fee, 8);
    this.state.totalFee = round(this.state.totalFee + fee, 8);

    order.status = 'filled';
    order.filledQty = order.qty;
    order.avgFillPrice = price;
    order.fee = fee;
    order.reservedMargin = 0;
    order.positionId = position.id;
    order.filledAt = iso();
    order.updatedAt = iso();

    this.addLedger('open_fee', -fee, this.state.walletBalance, {
      symbol: order.symbol,
      orderId: order.orderId,
      positionId: position.id,
      remark: `${order.side === 'long' ? '开多' : '开空'}手续费`,
    });
    this.recordEquity(markets);
    this.touch();
  }

  private executeClose(
    order: SimOrder,
    fillPrice: number,
    liquidity: 'maker' | 'taker',
    markets: Record<string, MarketSnapshot>,
    reason: 'user' | 'tp' | 'sl' | 'liquidation' = 'user',
  ): void {
    const position = order.positionId ? this.findPositionById(order.positionId) : this.findPosition(order.symbol);
    if (!position) throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '持仓不存在');

    const qty = round(Math.min(order.qty, position.qty), 8);
    if (qty <= EPS) throw new SimulationError(SIM_ERROR.INVALID_QTY, '平仓数量必须大于 0');

    const price = round(fillPrice, 8);
    if (price <= 0) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '成交价格无效');

    const feeRate = liquidity === 'taker' ? this.config.takerFeeRate : this.config.makerFeeRate;
    const notional = qty * price;
    const fee = round(notional * feeRate, 8);
    const marginPortion = round((position.margin * qty) / position.qty, 8);
    const rawPnl =
      position.side === 'long' ? (price - position.entryPrice) * qty : (position.entryPrice - price) * qty;
    // 逐仓仓位最大亏损不超过该仓位保证金，避免穿仓后把钱包打成大额负数。
    const pnl = round(Math.max(rawPnl, -marginPortion), 8);

    const balanceAfterPnl = round(this.state.walletBalance + pnl, 8);
    this.state.walletBalance = round(balanceAfterPnl - fee, 8);
    this.state.totalFee = round(this.state.totalFee + fee, 8);
    this.state.realizedPnl = round(this.state.realizedPnl + pnl - fee, 8);

    position.qty = round(position.qty - qty, 8);
    position.margin = round(position.margin - marginPortion, 8);
    position.realizedPnl = round(position.realizedPnl + pnl - fee, 8);
    position.updatedAt = iso();

    if (position.qty <= EPS) {
      position.qty = 0;
      position.margin = 0;
      position.status = reason === 'liquidation' ? 'liquidated' : 'closed';
      position.closedAt = iso();
      this.state.positions = this.state.positions.filter((p) => p.id !== position.id);
    }

    order.status = 'filled';
    order.filledQty = qty;
    order.avgFillPrice = price;
    order.fee = fee;
    order.reservedMargin = 0;
    order.filledAt = iso();
    order.updatedAt = iso();
    if (!order.positionId) order.positionId = position.id;

    this.addLedger(reason === 'liquidation' ? 'liquidation' : 'realized_pnl', pnl, balanceAfterPnl, {
      symbol: order.symbol,
      orderId: order.orderId,
      positionId: order.positionId || undefined,
      remark:
        reason === 'liquidation'
          ? '强制平仓盈亏'
          : reason === 'tp'
            ? '止盈平仓盈亏'
            : reason === 'sl'
              ? '止损平仓盈亏'
              : '平仓盈亏',
    });
    this.addLedger('close_fee', -fee, this.state.walletBalance, {
      symbol: order.symbol,
      orderId: order.orderId,
      positionId: order.positionId || undefined,
      remark: '平仓手续费',
    });

    this.recordEquity(markets);
    this.touch();
  }

  private closeByTrigger(
    position: SimPosition,
    market: MarketSnapshot,
    markets: Record<string, MarketSnapshot>,
    source: 'tp' | 'sl',
  ): void {
    const order = this.newOrder({
      symbol: position.symbol,
      side: position.side,
      action: 'close',
      orderType: 'market',
      leverage: position.leverage,
      qty: position.qty,
      price: null,
      takeProfitPrice: null,
      stopLossPrice: null,
      reduceOnly: true,
      source,
    });
    order.positionId = position.id;
    this.state.orders.push(order);
    const fillPrice = this.marketFillPrice(position.side === 'long' ? 'sell' : 'buy', market, true);
    try {
      this.executeClose(order, fillPrice, 'taker', markets, source);
    } catch (error) {
      this.rejectOrder(order, (error as Error).message);
      throw error;
    }
  }

  // ---------------------------------------------------------------- 内部：查询/工具

  private openPositions(): SimPosition[] {
    return this.state.positions.filter((p) => p.status === 'open' && p.qty > EPS);
  }

  private findPosition(symbol: string): SimPosition | undefined {
    return this.state.positions.find((p) => p.symbol === symbol && p.status === 'open');
  }

  private findPositionById(id: string): SimPosition | undefined {
    return this.state.positions.find((p) => p.id === id && p.status === 'open');
  }

  private availableBalance(): number {
    const margin = this.openPositions().reduce((sum, p) => sum + p.margin, 0);
    const orderMargin = this.orderMargin();
    return round(this.state.walletBalance - margin - orderMargin, 8);
  }

  private orderMargin(): number {
    return round(
      this.state.orders
        .filter((o) => o.status === 'pending' && o.action === 'open')
        .reduce((sum, o) => sum + o.reservedMargin, 0),
      8,
    );
  }

  private pendingCloseQty(symbol: string): number {
    return round(
      this.state.orders
        .filter((o) => o.status === 'pending' && o.action === 'close' && o.symbol === symbol)
        .reduce((sum, o) => sum + o.qty, 0),
      8,
    );
  }

  private maxCloseQty(position: SimPosition): number {
    return Math.max(0, round(position.qty - this.pendingCloseQty(position.symbol), 8));
  }

  private maxOpenQty(price: number, leverage: number, feeRate: number): number {
    const available = Math.max(0, this.availableBalance());
    const denominator = price * (1 / leverage + feeRate);
    if (denominator <= 0) return 0;
    return floor(available / denominator, 8);
  }

  private markPrice(position: SimPosition, markets: Record<string, MarketSnapshot>): number {
    const market = markets[position.symbol];
    const mark = market?.markPrice || market?.lastPrice;
    return mark && mark > 0 ? round(mark, 8) : position.entryPrice;
  }

  private lastPrice(position: SimPosition, markets: Record<string, MarketSnapshot>): number {
    const market = markets[position.symbol];
    const last = market?.lastPrice || market?.markPrice;
    return last && last > 0 ? round(last, 8) : position.entryPrice;
  }

  private pnl(position: SimPosition, mark: number): number {
    const value =
      position.side === 'long' ? (mark - position.entryPrice) * position.qty : (position.entryPrice - mark) * position.qty;
    return round(value, 8);
  }

  private liquidationPrice(side: 'long' | 'short', entryPrice: number, leverage: number): number {
    const mmr = this.config.maintenanceMarginRate;
    const factor = side === 'long' ? 1 - 1 / leverage + mmr : 1 + 1 / leverage - mmr;
    return round(Math.max(0, entryPrice * factor), 8);
  }

  private marketFillPrice(side: 'buy' | 'sell', market: MarketSnapshot, taker: boolean): number {
    const fallback = market.markPrice > 0 ? market.markPrice : market.lastPrice;
    const quoted = side === 'buy' ? market.askPrice || fallback : market.bidPrice || fallback;
    const slipped = taker
      ? side === 'buy'
        ? quoted * (1 + this.config.slippageRate)
        : quoted * (1 - this.config.slippageRate)
      : quoted;
    return round(slipped, 8);
  }

  private safeMarketPrice(market: MarketSnapshot): number {
    const price = market?.markPrice > 0 ? market.markPrice : market?.lastPrice;
    if (!price || price <= 0) {
      throw new SimulationError(SIM_ERROR.MARKET_UNAVAILABLE, '行情暂不可用，请稍后重试');
    }
    return round(price, 8);
  }

  private shouldTrigger(order: SimOrder, market: MarketSnapshot): boolean {
    if (order.price == null) return false;
    const last = market.lastPrice > 0 ? market.lastPrice : market.markPrice;
    if (last <= 0) return false;
    if (order.action === 'open') {
      return order.side === 'long' ? last <= order.price : last >= order.price;
    }
    return order.side === 'long' ? last >= order.price : last <= order.price;
  }

  private tpTriggered(position: SimPosition, mark: number): boolean {
    if (position.takeProfitPrice == null) return false;
    return position.side === 'long' ? mark >= position.takeProfitPrice : mark <= position.takeProfitPrice;
  }

  private slTriggered(position: SimPosition, mark: number): boolean {
    if (position.stopLossPrice == null) return false;
    return position.side === 'long' ? mark <= position.stopLossPrice : mark >= position.stopLossPrice;
  }

  private rejectOrder(order: SimOrder, reason: string): void {
    order.status = 'rejected';
    order.reservedMargin = 0;
    order.rejectReason = reason;
    order.updatedAt = iso();
  }

  private validateTpSl(
    side: 'long' | 'short',
    entryPrice: number,
    tp: number | null,
    sl: number | null,
  ): void {
    if (tp != null) {
      if (side === 'long' && tp <= entryPrice) {
        throw new SimulationError(SIM_ERROR.BAD_REQUEST, '多仓止盈价必须高于开仓价');
      }
      if (side === 'short' && tp >= entryPrice) {
        throw new SimulationError(SIM_ERROR.BAD_REQUEST, '空仓止盈价必须低于开仓价');
      }
    }
    if (sl != null) {
      if (side === 'long' && sl >= entryPrice) {
        throw new SimulationError(SIM_ERROR.BAD_REQUEST, '多仓止损价必须低于开仓价');
      }
      if (side === 'short' && sl <= entryPrice) {
        throw new SimulationError(SIM_ERROR.BAD_REQUEST, '空仓止损价必须高于开仓价');
      }
    }
  }

  private addLedger(
    type: SimLedgerType,
    amount: number,
    balanceAfter: number,
    extra: {
      symbol?: string;
      orderId?: string;
      positionId?: string;
      remark?: string;
    } = {},
  ): void {
    const entry: SimLedgerEntry = {
      id: `ledger_${this.state.nextLedgerId++}`,
      type,
      amount: round(amount, 8),
      balanceAfter: round(balanceAfter, 8),
      symbol: extra.symbol,
      orderId: extra.orderId,
      positionId: extra.positionId,
      remark: extra.remark,
      createdAt: iso(),
    };
    this.state.ledger.push(entry);
    if (this.state.ledger.length > MAX_LEDGER) {
      this.state.ledger.splice(0, this.state.ledger.length - MAX_LEDGER);
    }
  }

  private recordEquity(markets: Record<string, MarketSnapshot>, force = false): boolean {
    const equity = this.snapshot(markets).equity;
    const now = Date.now();
    const last = this.state.equityHistory[this.state.equityHistory.length - 1];

    if (!force && last && now - last.ts < EQUITY_INTERVAL_MS && Math.abs(equity - last.equity) < 0.01) {
      return false;
    }

    this.state.equityHistory.push({ ts: now, equity });
    if (this.state.equityHistory.length > MAX_HISTORY) {
      this.state.equityHistory.splice(0, this.state.equityHistory.length - MAX_HISTORY);
    }
    return true;
  }

  private newOrder(input: {
    symbol: string;
    side: 'long' | 'short';
    action: 'open' | 'close';
    orderType: 'market' | 'limit';
    leverage: number;
    qty: number;
    price: number | null;
    takeProfitPrice: number | null;
    stopLossPrice: number | null;
    reduceOnly: boolean;
    source: SimOrderSource;
  }): SimOrder {
    const now = iso();
    return {
      orderId: `ord_${this.state.nextOrderId++}`,
      symbol: input.symbol,
      side: input.side,
      action: input.action,
      orderType: input.orderType,
      leverage: input.leverage,
      qty: input.qty,
      price: input.price == null ? null : round(input.price, 8),
      status: 'pending',
      filledQty: 0,
      avgFillPrice: null,
      fee: 0,
      reservedMargin: 0,
      reduceOnly: input.reduceOnly,
      takeProfitPrice: input.takeProfitPrice,
      stopLossPrice: input.stopLossPrice,
      source: input.source,
      positionId: null,
      rejectReason: null,
      createdAt: now,
      updatedAt: now,
      filledAt: null,
    };
  }

  private toOrderSnapshot(order: SimOrder): OrderSnapshot {
    const notional =
      order.status === 'filled' && order.avgFillPrice != null
        ? order.filledQty * order.avgFillPrice
        : order.qty * (order.price ?? 0);

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
      notional: round(notional, 8),
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

  private parseSymbol(symbol: string): string {
    const value = String(symbol || '').trim();
    if (!value) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '交易对不能为空');
    return value;
  }

  private assertSide(side: string): asserts side is 'long' | 'short' {
    if (side !== 'long' && side !== 'short') {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '方向必须是 long 或 short');
    }
  }

  private assertAction(action: string): asserts action is 'open' | 'close' {
    if (action !== 'open' && action !== 'close') {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '开平方向必须是 open 或 close');
    }
  }

  private assertOrderType(orderType: string): asserts orderType is 'market' | 'limit' {
    if (orderType !== 'market' && orderType !== 'limit') {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '委托类型必须是 market 或 limit');
    }
  }

  private parseQty(value: string | number): number {
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new SimulationError(SIM_ERROR.INVALID_QTY, '下单数量必须大于 0');
    }
    return round(qty, 8);
  }

  private parseLeverage(value: number | undefined): number {
    const leverage = Number(value ?? 10);
    if (!Number.isInteger(leverage) || leverage < 1 || leverage > this.config.maxLeverage) {
      throw new SimulationError(
        SIM_ERROR.LEVERAGE_LIMIT,
        `杠杆必须是 1-${this.config.maxLeverage} 之间的整数`,
      );
    }
    return leverage;
  }

  private parsePrice(value: string | number | null | undefined, field: string): number {
    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, `${field}必须大于 0`);
    }
    return round(price, 8);
  }

  private optionalPrice(value: string | number | null | undefined, field: string): number | null {
    if (value === undefined || value === null || value === '') return null;
    return this.parsePrice(value, field);
  }

  private touch(): void {
    this.state.updatedAt = iso();
  }
}
