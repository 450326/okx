import { Injectable, Logger } from '@nestjs/common';
import { AccountStore, StoredAccount } from './account-store';
import {
  AccountModeStore,
  AccountTradingState,
  ModeTransitionLog,
} from './account-mode.store';
import { OkxApiService } from './okx-api.service';

export const MODE_ERROR = {
  INVALID_TRANSITION: 4100,
  API_REQUIRED: 4101,
  LIVE_TRADING_NOT_READY: 4102,
  BAD_REQUEST: 4103,
} as const;

export interface ModeCapabilities {
  canUseSimulation: boolean;
  canReadLive: boolean;
  canTradeLive: boolean;
  canEnterLiveReadonly: boolean;
  canEnterLiveTrading: boolean;
}

export interface AccountModeView {
  /** 兼容现有前端/API 的有效模式，只区分 simulation / live。 */
  mode: 'simulation' | 'live';
  /** 服务端真实状态机。 */
  state: AccountTradingState;
  capabilities: ModeCapabilities;
  blockers: string[];
  updatedAt: string;
  lastTransition: ModeTransitionLog | null;
}

export class ModeTransitionError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = 'ModeTransitionError';
  }
}

const STATE_LABEL: Record<AccountTradingState, string> = {
  simulation: '模拟盘',
  live_readonly: '实盘只读',
  live_trading: '实盘交易',
};

@Injectable()
export class AccountModeService {
  private readonly logger = new Logger(AccountModeService.name);

  constructor(
    private readonly modeStore: AccountModeStore,
    private readonly accountStore: AccountStore,
    private readonly okxApi: OkxApiService,
  ) {}

  async getView(): Promise<AccountModeView> {
    let state = this.modeStore.getState();
    const account = this.accountStore.getActiveOkx();

    // 实盘状态必须有可用的 API 账户；账户被删除或失效时自动退回模拟盘。
    if (state !== 'simulation' && !account) {
      this.logger.warn('实盘状态缺少可用 API 账户，自动退回模拟盘');
      this.modeStore.setState('simulation', 'active API account missing');
      state = 'simulation';
    }

    return this.buildView(state, account);
  }

  async changeMode(input: { mode?: string; reason?: string }): Promise<AccountModeView> {
    // 先做一次状态修正：API 账户被删除后，不允许继续停留在实盘状态。
    await this.getView();
    const current = this.modeStore.getState();
    const target = this.normalizeTarget(input?.mode);
    const reason = String(input?.reason || 'user_request').slice(0, 200);

    if (!target) {
      throw new ModeTransitionError('未知的交易模式', MODE_ERROR.BAD_REQUEST);
    }

    if (target === current) {
      return this.buildView(current, this.accountStore.getActiveOkx());
    }

    this.assertTransition(current, target);

    if (target === 'live_readonly') {
      const account = this.accountStore.getActiveOkx();
      if (!account) {
        this.reject('进入实盘只读需要先绑定并激活 OKX API 账户', target, MODE_ERROR.API_REQUIRED, [
          'NO_ACTIVE_API_ACCOUNT',
        ]);
      }
    }

    if (target === 'live_trading') {
      if (current !== 'live_readonly') {
        this.reject(
          '请先进入实盘只读，再开启实盘交易',
          target,
          MODE_ERROR.INVALID_TRANSITION,
          ['MUST_ENTER_LIVE_READONLY_FIRST'],
        );
      }

      const account = this.accountStore.getActiveOkx();
      if (!account) {
        this.reject('开启实盘交易需要先绑定并激活 OKX API 账户', target, MODE_ERROR.API_REQUIRED, [
          'NO_ACTIVE_API_ACCOUNT',
        ]);
      }

      const blockers = await this.checkLiveTradingReadiness(account);
      if (blockers.length) {
        this.reject(
          `实盘交易前置校验未通过：${this.blockerMessage(blockers)}`,
          target,
          MODE_ERROR.LIVE_TRADING_NOT_READY,
          blockers,
        );
      }
    }

    this.modeStore.setState(target, reason);
    this.logger.log(`交易模式切换：${STATE_LABEL[current]} -> ${STATE_LABEL[target]}`);
    return this.buildView(target, this.accountStore.getActiveOkx());
  }

  private normalizeTarget(mode?: string): AccountTradingState | null {
    if (mode === 'simulation') return 'simulation';
    // 兼容旧版前端只发送 live 的请求：先进入只读，不能直接进入交易。
    if (mode === 'live' || mode === 'live_readonly') return 'live_readonly';
    if (mode === 'live_trading') return 'live_trading';
    return null;
  }

  private assertTransition(from: AccountTradingState, to: AccountTradingState): void {
    const allowed =
      (from === 'simulation' && to === 'live_readonly') ||
      (from === 'live_readonly' && to === 'simulation') ||
      (from === 'live_readonly' && to === 'live_trading') ||
      (from === 'live_trading' && to === 'live_readonly') ||
      (from === 'live_trading' && to === 'simulation');

    if (!allowed) {
      this.reject(
        `不允许从「${STATE_LABEL[from]}」直接切换到「${STATE_LABEL[to]}」`,
        to,
        MODE_ERROR.INVALID_TRANSITION,
        [`INVALID_TRANSITION:${from}->${to}`],
      );
    }
  }

  private reject(message: string, target: AccountTradingState, code: number, blockers: string[]): never {
    this.modeStore.recordRejected(message, target);
    throw new ModeTransitionError(message, code, blockers);
  }

  private buildView(state: AccountTradingState, account?: StoredAccount): AccountModeView {
    const hasApi = Boolean(account);
    const snapshot = this.modeStore.getSnapshot();
    return {
      mode: state === 'simulation' ? 'simulation' : 'live',
      state,
      capabilities: {
        canUseSimulation: true,
        canReadLive: hasApi,
        canTradeLive: state === 'live_trading' && hasApi,
        canEnterLiveReadonly: hasApi,
        canEnterLiveTrading: state === 'live_readonly' && hasApi,
      },
      blockers: hasApi ? [] : ['NO_ACTIVE_API_ACCOUNT'],
      updatedAt: snapshot.updatedAt,
      lastTransition: snapshot.lastTransition,
    };
  }

  private async checkLiveTradingReadiness(account?: StoredAccount): Promise<string[]> {
    if (!account) return ['NO_ACTIVE_API_ACCOUNT'];
    const blockers: string[] = [];

    if (!account.apiKey || !account.apiSecret || !account.passphrase) {
      blockers.push('API_CREDENTIALS_INCOMPLETE');
    }
    if (!account.lastTestAt) {
      blockers.push('API_NOT_TESTED');
    }
    if (blockers.length) return blockers;

    const config = await this.okxApi.getAccountConfig(account);
    if (!config || config.code !== '0') {
      blockers.push('API_PRECHECK_FAILED');
      return blockers;
    }

    const perm = String(config.data?.[0]?.perm || '');
    if (perm && !perm.split(',').includes('trade')) {
      blockers.push('API_KEY_NO_TRADE_PERMISSION');
    }

    const balance = await this.okxApi.getBalance(account);
    if (!balance || balance.code !== '0') {
      blockers.push('API_BALANCE_CHECK_FAILED');
      return blockers;
    }

    const usdt = balance.data?.[0]?.details?.find((detail: any) => detail.ccy === 'USDT');
    const available = Number(usdt?.availBal ?? usdt?.eq ?? 0);
    if (!Number.isFinite(available) || available <= 0) {
      blockers.push('NO_AVAILABLE_MARGIN');
    }

    return blockers;
  }

  private blockerMessage(blockers: string[]): string {
    const labels: Record<string, string> = {
      NO_ACTIVE_API_ACCOUNT: '未绑定有效 API 账户',
      API_CREDENTIALS_INCOMPLETE: 'API 凭证不完整',
      API_NOT_TESTED: 'API 尚未通过连接测试',
      API_PRECHECK_FAILED: 'API 权限检查失败',
      API_KEY_NO_TRADE_PERMISSION: 'API Key 没有交易权限',
      API_BALANCE_CHECK_FAILED: '账户余额检查失败',
      NO_AVAILABLE_MARGIN: '没有可用保证金',
    };
    return blockers.map((blocker) => labels[blocker] || blocker).join('；');
  }
}
