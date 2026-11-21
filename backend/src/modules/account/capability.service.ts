import { Injectable } from '@nestjs/common';
import { CurrentUserService } from '../auth/current-user.service';
import { AccountStore } from './account-store';
import { AccountModeStore, AccountTradingState } from './account-mode.store';

import { ERROR_CODES } from '../../common/error-codes';
import { BusinessError } from '../../common/business-error';

export const CAPABILITY_ERROR = {
  DISABLED: ERROR_CODES.CAPABILITY_DISABLED,
  LIVE_ACCOUNT_REQUIRED: ERROR_CODES.LIVE_ACCOUNT_REQUIRED,
  LIVE_DATA_UNAVAILABLE: ERROR_CODES.LIVE_DATA_UNAVAILABLE,
  OVERLAY_FORBIDDEN: ERROR_CODES.OVERLAY_FORBIDDEN,
} as const;


export type CapabilityKey =
  | 'marketData'
  | 'futuresPositions'
  | 'futuresOpenOrders'
  | 'futuresOrderHistory'
  | 'futuresTrade'
  | 'spotHoldings'
  | 'spotTrade'
  | 'predictionPositions'
  | 'predictionTrade'
  | 'ledger'
  | 'equityHistory'
  | 'simulationReset';

export type CapabilitySource = 'public' | 'simulation' | 'okx' | 'none';

export interface CapabilityState {
  allowed: boolean;
  source: CapabilitySource;
  reason?: string;
  code?: number;
}

export interface CapabilityMatrix {
  state: AccountTradingState;
  isSuper: boolean;
  overlayEnabled: boolean;
  capabilities: Record<CapabilityKey, CapabilityState>;
}

export class CapabilityError extends BusinessError {
  constructor(
    message: string,
    code: number,
    readonly capability: CapabilityKey,
    readonly state: AccountTradingState,
  ) {
    super(code, message, { capability, state });
  }
}

@Injectable()
export class CapabilityService {
  constructor(
    private readonly modeStore: AccountModeStore,
    private readonly accountStore: AccountStore,
    private readonly currentUser: CurrentUserService,
  ) {}

  getMatrix(authorization?: string, overlayHeader?: string): CapabilityMatrix {
    const state = this.modeStore.getState();
    const account = this.accountStore.getActiveOkx();
    const user = this.currentUser.resolve(authorization);
    const live = state !== 'simulation';
    const overlayEnabled = live && user.isSuper && String(overlayHeader || '') === '1';
    const hasApi = Boolean(account);

    const sim = (): CapabilityState => ({ allowed: true, source: 'simulation' });
    const okx = (): CapabilityState => ({ allowed: true, source: 'okx' });
    const disabled = (reason: string, code: number = CAPABILITY_ERROR.DISABLED): CapabilityState => ({
      allowed: false,
      source: 'none',
      reason,
      code,
    });

    const liveRead = (reason: string): CapabilityState =>
      hasApi
        ? okx()
        : disabled(reason, CAPABILITY_ERROR.LIVE_ACCOUNT_REQUIRED);

    const capabilities: Record<CapabilityKey, CapabilityState> = live
      ? {
          marketData: { allowed: true, source: 'public' },
          futuresPositions: liveRead('未找到已激活的 OKX API 账户'),
          futuresOpenOrders: liveRead('未找到已激活的 OKX API 账户'),
          futuresOrderHistory: disabled('实盘历史订单读取开发中'),
          futuresTrade:
            state === 'live_trading'
              ? okx()
              : disabled('实盘只读模式，禁止下单'),
          spotHoldings: overlayEnabled
            ? sim()
            : disabled('平台暂未接入实盘现货持仓'),
          spotTrade: disabled('实盘现货交易开发中'),
          predictionPositions: overlayEnabled
            ? sim()
            : disabled('平台不支持实盘预测，已隐藏模拟预测持仓'),
          predictionTrade: disabled('平台不支持实盘预测交易'),
          ledger: disabled('实盘资金流水请到 OKX 查看'),
          equityHistory: disabled('实盘收益曲线开发中'),
          simulationReset: disabled('实盘模式不能重置模拟账户'),
        }
      : {
          marketData: { allowed: true, source: 'public' },
          futuresPositions: sim(),
          futuresOpenOrders: sim(),
          futuresOrderHistory: sim(),
          futuresTrade: sim(),
          spotHoldings: sim(),
          spotTrade: sim(),
          predictionPositions: sim(),
          predictionTrade: sim(),
          ledger: sim(),
          equityHistory: sim(),
          simulationReset: sim(),
        };

    return {
      state,
      isSuper: user.isSuper,
      overlayEnabled,
      capabilities,
    };
  }

  assert(
    capability: CapabilityKey,
    authorization?: string,
    overlayHeader?: string,
  ): CapabilityState {
    const matrix = this.getMatrix(authorization, overlayHeader);
    const state = matrix.capabilities[capability];
    if (!state.allowed) {
      throw new CapabilityError(
        state.reason || '当前模式不支持该操作',
        state.code || CAPABILITY_ERROR.DISABLED,
        capability,
        matrix.state,
      );
    }
    return state;
  }

  isOverlayRequested(authorization?: string, overlayHeader?: string): boolean {
    return this.getMatrix(authorization, overlayHeader).overlayEnabled;
  }
}
