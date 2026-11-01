import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { AuthStore } from './auth.store';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class GuestCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GuestCleanupService.name);
  private readonly dataDir = path.resolve(__dirname, '../../../data');
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
      this.removeUserFiles(userId);
      this.logger.log(`已清理过期游客 ${userId}`);
    }
    return expired.length;
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
