import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type NotificationType =
  | 'risk_warning'
  | 'liquidation'
  | 'take_profit'
  | 'stop_loss'
  | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  symbol?: string;
  positionId?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationFile {
  version: 1;
  notifications: AppNotification[];
  riskLevels: Record<string, string>;
}

const MAX_NOTIFICATIONS = 200;

@Injectable()
export class NotificationStore {
  private readonly logger = new Logger(NotificationStore.name);
  private readonly dataDir: string;

  constructor() {
    this.dataDir = path.resolve(__dirname, '../../../data');
  }

  list(userId: string, limit = 50): AppNotification[] {
    return this.load(userId).notifications.slice(0, Math.max(1, Math.min(200, limit)));
  }

  unreadCount(userId: string): number {
    return this.load(userId).notifications.filter((item) => !item.read).length;
  }

  add(
    userId: string,
    input: Omit<AppNotification, 'id' | 'read' | 'createdAt'>,
  ): AppNotification {
    const data = this.load(userId);
    const notification: AppNotification = {
      ...input,
      id: `ntf_${crypto.randomBytes(10).toString('hex')}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    data.notifications.unshift(notification);
    if (data.notifications.length > MAX_NOTIFICATIONS) {
      data.notifications.splice(MAX_NOTIFICATIONS);
    }
    this.save(userId, data);
    return notification;
  }

  markRead(userId: string, id: string): boolean {
    const data = this.load(userId);
    const item = data.notifications.find((entry) => entry.id === id);
    if (!item) return false;
    item.read = true;
    this.save(userId, data);
    return true;
  }

  markAllRead(userId: string): void {
    const data = this.load(userId);
    for (const item of data.notifications) item.read = true;
    this.save(userId, data);
  }

  getRiskLevel(userId: string, positionId: string): string | undefined {
    return this.load(userId).riskLevels[positionId];
  }

  setRiskLevel(userId: string, positionId: string, level: string): void {
    const data = this.load(userId);
    data.riskLevels[positionId] = level;
    this.save(userId, data);
  }

  removeRiskLevelsExcept(userId: string, positionIds: Set<string>): void {
    const data = this.load(userId);
    let changed = false;
    for (const id of Object.keys(data.riskLevels)) {
      if (!positionIds.has(id)) {
        delete data.riskLevels[id];
        changed = true;
      }
    }
    if (changed) this.save(userId, data);
  }

  private load(userId: string): NotificationFile {
    const file = this.filePath(userId);
    try {
      if (!fs.existsSync(file)) return this.empty();
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<NotificationFile>;
      return {
        version: 1,
        notifications: Array.isArray(raw.notifications)
          ? raw.notifications
              .filter((item): item is AppNotification => Boolean(item?.id && item?.title))
              .slice(0, MAX_NOTIFICATIONS)
          : [],
        riskLevels:
          raw.riskLevels && typeof raw.riskLevels === 'object'
            ? (raw.riskLevels as Record<string, string>)
            : {},
      };
    } catch (error) {
      this.logger.warn(`读取通知失败 ${userId}: ${(error as Error).message}`);
      return this.empty();
    }
  }

  private save(userId: string, data: NotificationFile): void {
    try {
      const dir = path.dirname(this.filePath(userId));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath(userId), JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`保存通知失败 ${userId}: ${(error as Error).message}`);
    }
  }

  private empty(): NotificationFile {
    return { version: 1, notifications: [], riskLevels: {} };
  }

  private filePath(userId: string): string {
    const safe = userId.replace(/[^A-Za-z0-9_-]/g, '_');
    return path.join(this.dataDir, `notifications-${safe}.json`);
  }
}
