import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type AccountTradingState = 'simulation' | 'live_readonly' | 'live_trading';

export interface ModeTransitionLog {
  from: AccountTradingState;
  to: AccountTradingState;
  at: string;
  reason: string;
  result: 'ok' | 'rejected';
}

interface StoredAccountMode {
  version: 1;
  state: AccountTradingState;
  updatedAt: string;
  lastTransition: ModeTransitionLog | null;
  logs: ModeTransitionLog[];
}

const MAX_LOGS = 100;

function isState(value: unknown): value is AccountTradingState {
  return value === 'simulation' || value === 'live_readonly' || value === 'live_trading';
}

/**
 * 交易模式的服务端持久化。
 *
 * 当前是单账户阶段，落在 backend/data/account-mode.json；
 * 多用户阶段会替换成“按 user_id 查询”的存储实现。
 */
@Injectable()
export class AccountModeStore {
  private readonly logger = new Logger(AccountModeStore.name);
  private readonly filePath: string;
  private data: StoredAccountMode;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../data/account-mode.json');
    this.data = this.load();
  }

  getState(): AccountTradingState {
    return this.data.state;
  }

  getSnapshot(): StoredAccountMode {
    return {
      ...this.data,
      logs: this.data.logs.map((log) => ({ ...log })),
    };
  }

  setState(state: AccountTradingState, reason: string, result: 'ok' | 'rejected' = 'ok'): void {
    const now = new Date().toISOString();
    const previous = this.data.state;
    if (previous !== state && result === 'ok') {
      const transition: ModeTransitionLog = {
        from: previous,
        to: state,
        at: now,
        reason,
        result: 'ok',
      };
      this.data.lastTransition = transition;
      this.data.logs.push(transition);
    }

    this.data.state = state;
    this.data.updatedAt = now;
    this.trimLogs();
    this.save();
  }

  recordRejected(reason: string, attemptedState: AccountTradingState): void {
    const now = new Date().toISOString();
    this.data.logs.push({
      from: this.data.state,
      to: attemptedState,
      at: now,
      reason,
      result: 'rejected',
    });
    this.trimLogs();
    this.save();
  }

  private trimLogs(): void {
    if (this.data.logs.length > MAX_LOGS) {
      this.data.logs.splice(0, this.data.logs.length - MAX_LOGS);
    }
  }

  private load(): StoredAccountMode {
    const fallback: StoredAccountMode = {
      version: 1,
      state: 'simulation',
      updatedAt: new Date().toISOString(),
      lastTransition: null,
      logs: [],
    };

    try {
      if (!fs.existsSync(this.filePath)) return fallback;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredAccountMode>;
      return {
        version: 1,
        state: isState(raw.state) ? raw.state : 'simulation',
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
        lastTransition:
          raw.lastTransition && isState(raw.lastTransition.from) && isState(raw.lastTransition.to)
            ? raw.lastTransition
            : null,
        logs: Array.isArray(raw.logs)
          ? raw.logs.filter(
              (log) =>
                log &&
                isState(log.from) &&
                isState(log.to) &&
                (log.result === 'ok' || log.result === 'rejected'),
            )
          : [],
      };
    } catch (error) {
      this.logger.warn(`读取交易模式失败，回退到 simulation: ${(error as Error).message}`);
      return fallback;
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`保存交易模式失败: ${(error as Error).message}`);
    }
  }
}
