import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { AccountStore, StoredAccount } from './account-store';
import { OkxApiService } from './okx-api.service';
import { OkxInstrumentService } from './okx-instrument.service';
import { LiveOrderRecord, LiveOrderStore } from './live-order.store';
import { SimulationOrderInput } from '../simulation/simulation.types';
import { RequestContextService } from '../auth/request-context.service';
import { ERROR_CODES } from '../../common/error-codes';

export const LIVE_ORDER_ERROR = {
  ID_CONFLICT: ERROR_CODES.CLIENT_ORDER_ID_CONFLICT,
  REJECTED: ERROR_CODES.LIVE_ORDER_REJECTED,
  UNKNOWN: ERROR_CODES.LIVE_ORDER_UNKNOWN,
  NOT_FOUND: ERROR_CODES.LIVE_ORDER_NOT_FOUND,
  INVALID: ERROR_CODES.LIVE_ORDER_INVALID,
  EXCHANGE_UNAVAILABLE: ERROR_CODES.EXCHANGE_UNAVAILABLE,
} as const;

export class LiveOrderError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly clientOrderId?: string,
  ) {
    super(message);
    this.name = 'LiveOrderError';
  }
}

const TAKER_FEE_RATE = 0.0005;
const SLIPPAGE_RATE = 0.0002;

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class LiveTradingService {
  private readonly logger = new Logger(LiveTradingService.name);

  constructor(
    private readonly accountStore: AccountStore,
    private readonly okxApi: OkxApiService,
    private readonly instruments: OkxInstrumentService,
    private readonly orders: LiveOrderStore,
    private readonly context: RequestContextService,
  ) {}

  async preview(input: SimulationOrderInput): Promise<Record<string, unknown>> {
    const account = this.requireAccount();
    const symbol = this.parseSymbol(input.symbol);
    const instrument = await this.instruments.get(symbol);
    const ticker = await this.okxApi.getTicker(symbol);
    const quote = ticker?.data?.[0];
    const last = num(quote?.last);
    const bid = num(quote?.bidPx) || last;
    const ask = num(quote?.askPx) || last;
    if (!last) throw new LiveOrderError('OKX 行情暂不可用', LIVE_ORDER_ERROR.EXCHANGE_UNAVAILABLE);

    const side = input.side === 'short' ? 'short' : 'long';
    const action = input.action === 'close' ? 'close' : 'open';
    const orderType = input.orderType === 'limit' ? 'limit' : 'market';
    const marginMode: 'cross' | 'isolated' =
      input.marginMode === 'cross' ? 'cross' : 'isolated';
    const leverage = Math.max(1, Math.round(Number(input.leverage) || 10));    if (leverage > instrument.maxLeverage) {
      throw new LiveOrderError(`杠杆超过 ${symbol} 最大限制 ${instrument.maxLeverage}x`, LIVE_ORDER_ERROR.INVALID);
    }

    const position = action === 'close' ? await this.findPosition(symbol, side) : null;
    const effectiveMarginMode =
      action === 'close' && position?.marginMode ? position.marginMode : marginMode;
    const qty =
      input.qty === undefined || input.qty === ''
        ? position?.qty || 0
        : Number(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new LiveOrderError('下单数量必须大于 0', LIVE_ORDER_ERROR.INVALID);
    }
    if (position && side !== position.side) {
      throw new LiveOrderError('平仓方向与 OKX 当前持仓不一致', LIVE_ORDER_ERROR.INVALID);
    }

    const price =
      orderType === 'limit'
        ? this.instruments.priceToTick(Number(input.price), instrument)
        : action === 'open'
          ? side === 'long'
            ? ask * (1 + SLIPPAGE_RATE)
            : bid * (1 - SLIPPAGE_RATE)
          : side === 'long'
            ? bid * (1 - SLIPPAGE_RATE)
            : ask * (1 + SLIPPAGE_RATE);
    if (!Number.isFinite(price) || price <= 0) {
      throw new LiveOrderError('委托价格必须大于 0', LIVE_ORDER_ERROR.INVALID);
    }

    const contracts = this.instruments.qtyToContracts(qty, instrument);
    if (contracts < instrument.minSz) {
      throw new LiveOrderError(
        `数量低于 ${symbol} 最小下单量 ${instrument.minSz * instrument.ctVal}`,
        LIVE_ORDER_ERROR.INVALID,
      );
    }

    const balance = await this.getAvailableBalance(account);
    const notional = qty * price;
    const margin = action === 'open' ? notional / leverage : 0;
    const fee = notional * TAKER_FEE_RATE;
    const maxQty =
      action === 'close'
        ? position?.qty || 0
        : (() => {
            const baseStep = Math.max(instrument.lotSz * instrument.ctVal, 1e-12);
            const raw = balance / (price / leverage + price * TAKER_FEE_RATE);
            return Math.max(0, Math.floor(raw / baseStep) * baseStep);
          })();

    return {
      symbol,
      side,
      action,
      orderType,
      leverage,
      marginMode: effectiveMarginMode,
      qty: String(qty),
      markPrice: String(last),
      price: String(price),
      estimatedNotional: String(notional),
      estimatedMargin: String(margin),
      estimatedFee: String(fee),
      estimatedLiquidationPrice: String(this.liquidationPrice(side, price, leverage)),
      maxQty: String(maxQty),
      availableBalance: String(balance),
    };
  }

  async place(input: SimulationOrderInput): Promise<Record<string, unknown>> {
    const account = this.requireAccount();
    const symbol = this.parseSymbol(input.symbol);
    const clientOrderId = String(input.clientOrderId || '').trim();
    if (!/^[A-Za-z0-9]{1,32}$/.test(clientOrderId)) {
      throw new LiveOrderError('实盘下单必须提供合法的 clientOrderId', LIVE_ORDER_ERROR.INVALID);
    }
    if (input.takeProfitPrice || input.stopLossPrice) {
      throw new LiveOrderError('实盘下单暂不支持同时设置止盈止损，请先下主单', LIVE_ORDER_ERROR.INVALID);
    }

    const requestHash = this.hashRequest(input, symbol);
    const userId = this.context.userId();
    const existing = this.orders.get(clientOrderId, userId);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new LiveOrderError('clientOrderId 已用于另一笔不同参数的订单', LIVE_ORDER_ERROR.ID_CONFLICT);
      }
      return this.resultOf(existing);
    }

    const preview = await this.preview(input);
    const instrument = await this.instruments.get(symbol);
    const qty = Number(preview.qty);
    const contracts = this.instruments.qtyToContracts(qty, instrument);
    const side = input.side === 'short' ? 'short' : 'long';
    const action = input.action === 'close' ? 'close' : 'open';
    const orderType = input.orderType === 'limit' ? 'limit' : 'market';
    const marginMode: 'cross' | 'isolated' =
      preview.marginMode === 'cross' ? 'cross' : 'isolated';
    const leverage = Number(preview.leverage) || 10;
    const orderSide =
      action === 'open'
        ? side === 'long'
          ? 'buy'
          : 'sell'
        : side === 'long'
          ? 'sell'
          : 'buy';

    // OKX 实盘杠杆是账户/品种级配置；下单前必须同步，避免本地按选择杠杆
    // 估算保证金、交易所却按旧杠杆占用。
    if (action === 'open') {
      const leverageResult = await this.okxApi.setLeverage(account, {
        instId: symbol,
        lever: String(leverage),
        mgnMode: marginMode,
        posSide: side,
      });
      if (!leverageResult || leverageResult.code !== '0') {
        throw new LiveOrderError(
          leverageResult?.msg || 'OKX 设置杠杆失败，请检查账户保证金模式和持仓',
          LIVE_ORDER_ERROR.REJECTED,
          clientOrderId,
        );
      }
    }

    const now = new Date().toISOString();
    const record: LiveOrderRecord = {
      userId,
      clientOrderId,
      requestHash,
      instId: symbol,
      side,
      action,
      orderType,
      marginMode,
      qty: String(qty),
      price: orderType === 'limit' ? String(preview.price) : null,
      leverage: Number(preview.leverage),
      exchangeOrderId: null,
      localStatus: 'submitting',
      exchangeStatus: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.save(record);

    const payload: Parameters<OkxApiService['placeOrder']>[1] = {
      instId: symbol,
      tdMode: marginMode,
      side: orderSide,
      posSide: side,
      ordType: orderType,
      sz: this.formatNumber(contracts, instrument.lotSz),
      clOrdId: clientOrderId,
    };
    if (orderType === 'limit') {
      payload.px = this.formatNumber(Number(preview.price), instrument.tickSz);
    }

    let response: any = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await this.okxApi.placeOrder(account, payload);
        if (response) break;
        lastError = new Error('OKX 下单请求无响应');
      } catch (error) {
        lastError = error as Error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    if (!response) {
      record.localStatus = 'unknown';
      record.errorMessage = lastError?.message || 'OKX 下单请求无响应';
      record.updatedAt = new Date().toISOString();
      this.orders.save(record);
      throw new LiveOrderError(
        `下单结果未知，请勿重复提交同一 clientOrderId：${record.errorMessage}`,
        LIVE_ORDER_ERROR.UNKNOWN,
        clientOrderId,
      );
    }

    if (response.code !== '0') {
      if (this.isDuplicateClientOrderId(response)) {
        const existingOrder = await this.queryOrder(account, symbol, clientOrderId);
        if (existingOrder) {
          record.exchangeOrderId = existingOrder.ordId || null;
          record.localStatus = 'pending';
          record.exchangeStatus = this.mapExchangeStatus(existingOrder.state);
          record.updatedAt = new Date().toISOString();
          this.orders.save(record);
          return this.resultOf(record);
        }
      }
      record.localStatus = 'rejected';
      record.exchangeStatus = 'rejected';
      record.errorMessage = response.msg || 'OKX 拒单';
      record.updatedAt = new Date().toISOString();
      this.orders.save(record);
      throw new LiveOrderError(record.errorMessage || 'OKX 拒单', LIVE_ORDER_ERROR.REJECTED, clientOrderId);
    }

    const item = response.data?.[0];
    if (!item || item.sCode !== '0') {
      if (this.isDuplicateClientOrderId(response) || String(item?.sCode) === '51016') {
        const existingOrder = await this.queryOrder(account, symbol, clientOrderId);
        if (existingOrder) {
          record.exchangeOrderId = existingOrder.ordId || null;
          record.localStatus = 'pending';
          record.exchangeStatus = this.mapExchangeStatus(existingOrder.state);
          record.updatedAt = new Date().toISOString();
          this.orders.save(record);
          return this.resultOf(record);
        }
      }
      record.localStatus = 'rejected';
      record.exchangeStatus = 'rejected';
      record.errorMessage = item?.sMsg || 'OKX 拒单';
      record.updatedAt = new Date().toISOString();
      this.orders.save(record);
      throw new LiveOrderError(record.errorMessage || 'OKX 拒单', LIVE_ORDER_ERROR.REJECTED, clientOrderId);
    }

    record.exchangeOrderId = item.ordId || null;
    record.localStatus = 'pending';
    record.exchangeStatus = 'pending';
    record.updatedAt = new Date().toISOString();
    this.orders.save(record);
    return this.resultOf(record);
  }

  async cancel(orderId: string, symbol?: string): Promise<Record<string, unknown>> {
    const account = this.requireAccount();
    const record = this.orders.findByExchangeOrderId(orderId, this.context.userId());
    const instId = symbol || record?.instId;
    if (!instId) {
      throw new LiveOrderError('缺少交易对，无法撤单', LIVE_ORDER_ERROR.NOT_FOUND);
    }

    const result = await this.okxApi.cancelOrder(account, {
      instId,
      ordId: orderId,
      clOrdId: record?.clientOrderId,
    });
    if (!result || result.code !== '0') {
      throw new LiveOrderError(result?.msg || 'OKX 撤单失败', LIVE_ORDER_ERROR.REJECTED);
    }
    if (record) {
      record.localStatus = 'cancelled';
      record.exchangeStatus = 'cancelled';
      record.updatedAt = new Date().toISOString();
      this.orders.save(record);
    }
    return { orderId, status: 'cancelled', source: 'okx' };
  }

  listOrders(): Record<string, unknown>[] {
    return this.orders.list(this.context.userId()).map((order) => this.resultOf(order));
  }

  async sync(clientOrderId: string): Promise<Record<string, unknown>> {
    const record = this.orders.get(clientOrderId, this.context.userId());
    if (!record) {
      throw new LiveOrderError('实盘订单不存在', LIVE_ORDER_ERROR.NOT_FOUND, clientOrderId);
    }
    const account = this.requireAccount();
    const result = await this.okxApi.getOrder(account, {
      instId: record.instId,
      ordId: record.exchangeOrderId || undefined,
      clOrdId: record.clientOrderId,
    });
    if (result?.code === '0' && result.data?.[0]) {
      record.exchangeStatus = this.mapExchangeStatus(result.data[0].state);
      record.updatedAt = new Date().toISOString();
      this.orders.save(record);
    }
    return this.resultOf(record);
  }

  private resultOf(record: LiveOrderRecord): Record<string, unknown> {
    return {
      orderId: record.exchangeOrderId || record.clientOrderId,
      clientOrderId: record.clientOrderId,
      exchangeOrderId: record.exchangeOrderId,
      status: record.localStatus,
      localStatus: record.localStatus,
      exchangeStatus: record.exchangeStatus,
      mismatch: Boolean(
        record.exchangeStatus &&
          record.localStatus !== 'unknown' &&
          record.localStatus !== record.exchangeStatus,
      ),
      symbol: record.instId,
      side: record.side,
      action: record.action,
      orderType: record.orderType,
      marginMode: record.marginMode || 'isolated',
      qty: record.qty,
      price: record.price,
      leverage: record.leverage,
      errorMessage: record.errorMessage,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private requireAccount(): StoredAccount {
    const account = this.accountStore.getActiveOkx();
    if (!account) {
      throw new LiveOrderError('未找到已激活的 OKX API 账户', ERROR_CODES.LIVE_ACCOUNT_REQUIRED);
    }
    return account;
  }

  private isDuplicateClientOrderId(response: any): boolean {
    const code = String(response?.code || '');
    const item = response?.data?.[0];
    const sCode = String(item?.sCode || '');
    const text = `${response?.msg || ''} ${item?.sMsg || ''}`;
    return code === '51016' || sCode === '51016' || /duplicat|clOrdId/i.test(text);
  }

  private async queryOrder(
    account: StoredAccount,
    instId: string,
    clientOrderId: string,
  ): Promise<any | null> {
    try {
      const result = await this.okxApi.getOrder(account, { instId, clOrdId: clientOrderId });
      if (result?.code === '0' && result.data?.[0]) return result.data[0];
    } catch {
      // 查询失败时保持 unknown，交给人工/后续同步处理
    }
    return null;
  }

  private async getAvailableBalance(account: StoredAccount): Promise<number> {
    const result = await this.okxApi.getBalance(account);
    if (!result || result.code !== '0') {
      throw new LiveOrderError(result?.msg || 'OKX 余额读取失败', LIVE_ORDER_ERROR.EXCHANGE_UNAVAILABLE);
    }
    const usdt = result.data?.[0]?.details?.find((detail: any) => detail.ccy === 'USDT');
    return num(usdt?.availBal ?? usdt?.eq);
  }

  private async findPosition(symbol: string, side: 'long' | 'short') {
    const account = this.requireAccount();
    const result = await this.okxApi.getPositions(account, 'SWAP');
    if (!result || result.code !== '0') {
      throw new LiveOrderError(result?.msg || 'OKX 持仓读取失败', LIVE_ORDER_ERROR.EXCHANGE_UNAVAILABLE);
    }
    const item = (result.data || []).find((pos: any) => {
      if (pos.instId !== symbol || Math.abs(num(pos.pos)) <= 0) return false;
      const posSide = String(pos.posSide || '');
      return posSide ? posSide === side : (num(pos.pos) > 0 ? 'long' : 'short') === side;
    });
    if (!item) {
      throw new LiveOrderError('OKX 当前没有可平仓位', LIVE_ORDER_ERROR.INVALID);
    }
    const instrument = await this.instruments.get(symbol);
    return {
      qty: this.instruments.contractsToQty(Math.abs(num(item.pos)), instrument),
      side: String(item.posSide || (num(item.pos) > 0 ? 'long' : 'short')) as 'long' | 'short',
      entryPrice: num(item.avgPx),
      marginMode: item.mgnMode === 'cross' ? ('cross' as const) : ('isolated' as const),
    };
  }

  private parseSymbol(symbol: string): string {
    const value = String(symbol || '').trim().toUpperCase();
    if (!value.endsWith('-USDT-SWAP')) {
      throw new LiveOrderError('实盘下单目前只支持 USDT 永续合约', LIVE_ORDER_ERROR.INVALID);
    }
    return value;
  }

  private hashRequest(input: SimulationOrderInput, symbol: string): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          symbol,
          side: input.side,
          action: input.action,
          orderType: input.orderType,
          leverage: input.leverage,
          marginMode: input.marginMode ?? 'isolated',
          qty: input.qty,
          price: input.price ?? null,
          reduceOnly: input.reduceOnly ?? input.action === 'close',
          takeProfitPrice: input.takeProfitPrice ?? null,
          stopLossPrice: input.stopLossPrice ?? null,
        }),
      )
      .digest('hex');
  }

  private liquidationPrice(side: 'long' | 'short', entryPrice: number, leverage: number): number {
    const factor = side === 'long' ? 1 - 1 / leverage + 0.005 : 1 + 1 / leverage - 0.005;
    return Math.max(0, entryPrice * factor);
  }

  private mapExchangeStatus(state: string): string {
    const map: Record<string, string> = {
      live: 'pending',
      partially_filled: 'partially_filled',
      filled: 'filled',
      canceled: 'cancelled',
      mmp_canceled: 'cancelled',
    };
    return map[state] || state || 'unknown';
  }

  private formatNumber(value: number, step: number): string {
    const decimals = Math.max(0, (String(step).split('.')[1] || '').length);
    const fixed = value.toFixed(decimals);
    return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  }
}
