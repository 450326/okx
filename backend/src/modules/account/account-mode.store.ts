import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContextService } from '../auth/request-context.service';

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

@Injectable()
export class AccountModeStore {
  private readonly logger = new Logger(AccountModeStore.name);
  private readonly dataDir: string;
  private readonly states = new Map<string, StoredAccountMode>();

  constructor(private readonly context: RequestContextService) {
    this.dataDir = path.resolve(__dirname, '../../../data');
    this.get(this.context.userId());
  }

  getState(): AccountTradingState {
    return this.get(this.context.userId()).state;
  }

  getSnapshot(): StoredAccountMode {
    const data = this.get(this.context.userId());
    return {
      ...data,
      logs: data.logs.map((log) => ({ ...log })),
    };
  }

  setState(state: AccountTradingState, reason: string, result: 'ok' | 'rejected' = 'ok'): void {
    const userId = this.context.userId();
    const data = this.get(userId);
    const now = new Date().toISOString();
    const previous = data.state;
    if (previous !== state && result === 'ok') {
      const transition: ModeTransitionLog = {
        from: previous,
        to: state,
        at: now,
        reason,
        result: 'ok',
      };
      data.lastTransition = transition;
      data.logs.push(transition);
    }

    data.state = state;
    data.updatedAt = now;
    this.trimLogs(data);
    this.save(userId, data);
  }

  recordRejected(reason: string, attemptedState: AccountTradingState): void {
    const userId = this.context.userId();
    const data = this.get(userId);
    data.logs.push({
      from: data.state,
      to: attemptedState,
      at: new Date().toISOString(),
      reason,
      result: 'rejected',
    });
    this.trimLogs(data);
    this.save(userId, data);
  }

  private trimLogs(data: StoredAccountMode): void {
    if (data.logs.length > MAX_LOGS) {
      data.logs.splice(0, data.logs.length - MAX_LOGS);
    }
  }

  private filePath(userId: string): string {
    if (userId === 'u_demo') return path.join(this.dataDir, 'account-mode.json');
    const safe = userId.replace(/[^A-Za-z0-9_-]/g, '_');
    return path.join(this.dataDir, `account-mode-${safe}.json`);
  }

  private get(userId: string): StoredAccountMode {
    const existing = this.states.get(userId);
    if (existing) return existing;

    const fallback: StoredAccountMode = {
      version: 1,
      state: 'simulation',
      updatedAt: new Date().toISOString(),
      lastTransition: null,
      logs: [],
    };

    try {
      const filePath = this.filePath(userId);
      if (!fs.existsSync(filePath)) {
        this.states.set(userId, fallback);
        return fallback;
      }
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<StoredAccountMode>;
      const loaded: StoredAccountMode = {
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
      this.states.set(userId, loaded);
      return loaded;
    } catch (error) {
      this.logger.warn(`读取交易模式失败，回退到 simulation: ${(error as Error).message}`);
      this.states.set(userId, fallback);
      return fallback;
    }
  }

  private save(userId: string, data: StoredAccountMode): void {
    try {
      const filePath = this.filePath(userId);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`保存交易模式失败: ${(error as Error).message}`);
    }
  }
}
