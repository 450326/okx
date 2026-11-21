import { Injectable } from '@nestjs/common';
import { AccountStore, StoredAccount } from './account-store';
import { OkxApiService } from './okx-api.service';
import { OkxInstrumentService } from './okx-instrument.service';
import { CAPABILITY_ERROR, CapabilityError } from './capability.service';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string | undefined {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : undefined;
}

@Injectable()
export class LiveAccountService {
  constructor(
    private readonly accountStore: AccountStore,
    private readonly okxApi: OkxApiService,
    private readonly instruments: OkxInstrumentService,
  ) {}

  requireAccount(): StoredAccount {
    const account = this.accountStore.getActiveOkx();
    if (!account) {
      throw new CapabilityError(
        '未找到已激活的 OKX API 账户',
        CAPABILITY_ERROR.LIVE_ACCOUNT_REQUIRED,
        'futuresPositions',
        'live_readonly',
      );
    }
    return account;
  }

  async getPositions(symbol?: string): Promise<Record<string, unknown>[]> {
    const account = this.requireAccount();
    const result = await this.okxApi.getPositions(account, 'SWAP');
    if (!result || result.code !== '0') {
      throw new CapabilityError(
        result?.msg || 'OKX 持仓读取失败',
        CAPABILITY_ERROR.LIVE_DATA_UNAVAILABLE,
        'futuresPositions',
        'live_readonly',
      );
    }

    return Promise.all(
      (result.data || [])
        .filter((item: any) => item && String(item.instId || '').endsWith('-SWAP'))
        .filter((item: any) => Math.abs(num(item.pos)) > 0)
        .filter((item: any) => !symbol || item.instId === symbol)
        .map(async (item: any) => {
          const instrument = await this.instrumentOrFallback(item.instId);
          const qty = this.instruments.contractsToQty(Math.abs(num(item.pos)), instrument);
          const entryPrice = num(item.avgPx);
          const markPrice = num(item.markPx) || entryPrice;
          const margin = num(item.margin) || num(item.imr);
          const upl = num(item.upl);
          const posSide = String(item.posSide || '');
          const side = posSide === 'short' || (posSide !== 'long' && num(item.pos) < 0) ? 'short' : 'long';
          const takeProfitPrice = num(item.tpTriggerPx);
          const stopLossPrice = num(item.slTriggerPx);
          return {
            id: `${item.instId}:${posSide || 'net'}`,
            symbol: item.instId,
            side,
            leverage: Math.max(1, Math.round(num(item.lever) || 1)),
            qty: String(qty),
            entryPrice: String(entryPrice),
            markPrice: String(markPrice),
            lastPrice: String(num(item.lastPx) || markPrice),
            notional: String(qty * markPrice),
            initialMargin: String(margin),
            maintenanceMargin: String(num(item.maintMargin) || 0),
            liquidationPrice: String(num(item.liqPx) || 0),
            unrealizedPnl: String(upl),
            realizedPnl: String(num(item.realizedPnl) || 0),
            roe: String(margin > 0 ? upl / margin : 0),
            takeProfitPrice: takeProfitPrice > 0 ? String(takeProfitPrice) : undefined,
            stopLossPrice: stopLossPrice > 0 ? String(stopLossPrice) : undefined,
            status: 'open',
            createdAt: iso(item.cTime),
            updatedAt: iso(item.uTime),
            source: 'okx',
          };
        }),
    );
  }

  async getOpenOrders(symbol?: string): Promise<Record<string, unknown>[]> {
    const account = this.requireAccount();
    const result = await this.okxApi.getPendingOrders(account, symbol);
    if (!result || result.code !== '0') {
      throw new CapabilityError(
        result?.msg || 'OKX 委托读取失败',
        CAPABILITY_ERROR.LIVE_DATA_UNAVAILABLE,
        'futuresOpenOrders',
        'live_readonly',
      );
    }

    const stateMap: Record<string, string> = {
      live: 'pending',
      partially_filled: 'partially_filled',
      filled: 'filled',
      canceled: 'cancelled',
      mmp_canceled: 'cancelled',
    };

    return Promise.all(
      (result.data || [])
        .filter((item: any) => item && (!symbol || item.instId === symbol))
        .map(async (item: any) => {
          const instrument = await this.instrumentOrFallback(item.instId);
          const posSide = String(item.posSide || '');
          const side = posSide === 'short' || (posSide !== 'long' && item.side === 'sell') ? 'short' : 'long';
          const reduceOnly = String(item.reduceOnly) === 'true';
          const price = num(item.px);
          const qty = this.instruments.contractsToQty(num(item.sz), instrument);
          const filledQty = this.instruments.contractsToQty(num(item.accFillSz), instrument);
          return {
            orderId: item.ordId,
            symbol: item.instId,
            side,
            action: reduceOnly ? 'close' : 'open',
            status: stateMap[item.state] || item.state,
            orderType: item.ordType === 'limit' ? 'limit' : 'market',
            price: price > 0 ? String(price) : undefined,
            avgFillPrice: num(item.avgPx) > 0 ? String(num(item.avgPx)) : null,
            qty: String(qty),
            filledQty: String(filledQty),
            notional: String(num(item.notionalUsd) || price * qty),
            fee: String(num(item.fee)),
            reduceOnly,
            source: 'okx',
            createdAt: iso(item.cTime),
            updatedAt: iso(item.uTime),
          };
        }),
    );
  }

  private async instrumentOrFallback(instId: string) {
    try {
      return await this.instruments.get(instId);
    } catch {
      // 仅用于展示持仓/委托时的数量换算；拿不到真实品种信息时不冒充 live
      return {
        instId,
        ctVal: 1,
        ctValCcy: '',
        lotSz: 0.01,
        minSz: 0.01,
        tickSz: 0.01,
        ctType: 'linear',
        maxLeverage: 1,
        state: 'unknown',
      };
    }
  }
}
