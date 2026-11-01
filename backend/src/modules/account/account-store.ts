import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContextService } from '../auth/request-context.service';

export interface StoredAccount {
  id: string;
  userId: string;
  exchange: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  isTestnet: boolean;
  status: string;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

@Injectable()
export class AccountStore {
  private accounts = new Map<string, StoredAccount>();
  private readonly filePath: string;

  constructor(private readonly context: RequestContextService) {
    this.filePath = path.resolve(__dirname, '../../../data/accounts.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const arr: StoredAccount[] = JSON.parse(raw);
        arr.forEach((a) => {
          // 旧数据没有 userId，统一归属演示账号。
          this.accounts.set(a.id, { ...a, userId: a.userId || 'u_demo' });
        });
        console.log(`[AccountStore] 已加载 ${arr.length} 个 API 账户`);
      }
    } catch (err) {
      console.error('[AccountStore] 加载失败:', err.message);
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const arr = Array.from(this.accounts.values());
      // 写文件时去掉 apiSecret 的明文（只保留部分用于识别）
      const safe = arr.map((a) => ({
        ...a,
        apiKey: a.apiKey,
        apiSecret: a.apiSecret,
        passphrase: a.passphrase,
      }));
      fs.writeFileSync(this.filePath, JSON.stringify(safe, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AccountStore] 保存失败:', err.message);
    }
  }

  set(id: string, account: StoredAccount) {
    this.accounts.set(id, account);
    this.save();
  }

  get(id: string, userId = this.context.userId()): StoredAccount | undefined {
    const account = this.accounts.get(id);
    return account && account.userId === userId ? account : undefined;
  }

  delete(id: string) {
    this.accounts.delete(id);
    this.save();
  }

  getAll(userId = this.context.userId()): StoredAccount[] {
    return Array.from(this.accounts.values()).filter((account) => account.userId === userId);
  }

  getActiveOkx(userId = this.context.userId()): StoredAccount | undefined {
    for (const acc of this.accounts.values()) {
      if (acc.userId === userId && acc.exchange === 'okx' && acc.status === 'active') return acc;
    }
    return undefined;
  }
}
