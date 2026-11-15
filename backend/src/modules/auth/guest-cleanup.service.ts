import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuthStore } from './auth.store';

const { DatabaseSync } = require('node:sqlite');
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DB_FILE = path.resolve(__dirname, '../../../data/app.db');

@Injectable()
export class GuestCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestCleanupService.name);
  private readonly dataDir = path.resolve(__dirname, '../../../data');
  private readonly db = new DatabaseSync(DB_FILE);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly store: AuthStore) {}

  onModuleInit(): void {
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(): Promise<number> {
    const expired = this.store.listExpiredGuests();
    for (const userId of expired) {
      this.store.deleteUser(userId);
      this.deleteSimulationRows(userId);
      this.removeUserFiles(userId);
      this.logger.log(`已清理过期游客 ${userId}`);
    }
    return expired.length;
  }

  private deleteSimulationRows(userId: string): void {
    try {
      for (const table of [
        'sim_positions',
        'sim_orders',
        'sim_spot_holdings',
        'sim_spot_orders',
        'sim_prediction_positions',
        'sim_prediction_orders',
        'sim_ledger',
        'sim_equity_history',
        'sim_accounts',
      ]) {
        this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
      }
    } catch (error) {
      this.logger.warn(`删除游客账本失败 ${userId}: ${(error as Error).message}`);
    }
  }

  private removeUserFiles(userId: string): void {
    const safe = userId.replace(/[^A-Za-z0-9_-]/g, '_');
    const names = [
      `simulation-${safe}.json`,
      `simulation-${safe}.json.tmp`,
      `account-mode-${safe}.json`,
      `account-mode-${safe}.json.tmp`,
      `notifications-${safe}.json`,
      `notifications-${safe}.json.tmp`,
    ];
    for (const name of names) {
      const target = path.join(this.dataDir, name);
      try {
        if (fs.existsSync(target)) fs.rmSync(target, { force: true });
      } catch (error) {
        this.logger.warn(`删除游客文件失败 ${name}: ${(error as Error).message}`);
      }
    }
  }
}
