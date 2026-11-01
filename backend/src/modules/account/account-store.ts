import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RequestContextService } from '../auth/request-context.service';
import { AccountCryptoService } from './account-crypto.service';

export interface StoredAccount {
  id: string;
  userId: string;
  exchange: string;
  label: string;
  /** 运行时明文，仅用于签名；绝不会序列化到文件或响应。 */
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  apiKeyMasked: string;
  apiKeyFingerprint: string;
  permissions?: string[];
  isTestnet: boolean;
  status: string;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

interface PersistedAccount {
  id: string;
  userId: string;
  exchange: string;
  label: string;
  apiKeyCipher: string;
  apiSecretCipher: string;
  passphraseCipher: string;
  apiKeyMasked: string;
  apiKeyFingerprint: string;
  permissions?: string[];
  isTestnet: boolean;
  status: string;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

@Injectable()
export class AccountStore {
  private readonly logger = new Logger(AccountStore.name);
  private accounts = new Map<string, StoredAccount>();
  private readonly filePath: string;

  constructor(
    private readonly context: RequestContextService,
    private readonly cryptoService: AccountCryptoService,
  ) {
    this.filePath = path.resolve(__dirname, '../../../data/accounts.json');
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const arr = JSON.parse(raw) as Array<Partial<PersistedAccount> & Partial<StoredAccount>>;
      let needsRewrite = false;

      for (const item of arr) {
        if (!item?.id) continue;
        const userId = item.userId || 'u_demo';
        const aadBase = `${item.id}:${userId}:${item.exchange || 'okx'}`;
        try {
          if (item.apiKeyCipher && item.apiSecretCipher && item.passphraseCipher) {
            this.accounts.set(item.id, {
              id: item.id,
              userId,
              exchange: item.exchange || 'okx',
              label: item.label || 'OKX',
              apiKey: this.cryptoService.decrypt(item.apiKeyCipher, `${aadBase}:apiKey`),
              apiSecret: this.cryptoService.decrypt(item.apiSecretCipher, `${aadBase}:apiSecret`),
              passphrase: this.cryptoService.decrypt(item.passphraseCipher, `${aadBase}:passphrase`),
              apiKeyMasked: item.apiKeyMasked || '****',
              apiKeyFingerprint: item.apiKeyFingerprint || '',
              permissions: Array.isArray(item.permissions) ? item.permissions : [],
              isTestnet: Boolean(item.isTestnet),
              status: item.status || 'error',
              lastTestAt: item.lastTestAt || null,
              lastSyncAt: item.lastSyncAt || null,
              createdAt: item.createdAt || new Date().toISOString(),
            });
          } else if (item.apiSecret && item.passphrase) {
            // 旧版本明文数据：读入内存后立即加密重写，原文件不保留备份。
            needsRewrite = true;
            this.accounts.set(item.id, {
              id: item.id,
              userId,
              exchange: item.exchange || 'okx',
              label: item.label || 'OKX',
              apiKey: item.apiKey || '',
              apiSecret: item.apiSecret,
              passphrase: item.passphrase,
              apiKeyMasked: this.cryptoService.mask(item.apiKey || ''),
              apiKeyFingerprint: this.cryptoService.fingerprint(item.apiKey || ''),
              permissions: Array.isArray(item.permissions) ? item.permissions : [],
              isTestnet: Boolean(item.isTestnet),
              status: item.status || 'error',
              lastTestAt: item.lastTestAt || null,
              lastSyncAt: item.lastSyncAt || null,
              createdAt: item.createdAt || new Date().toISOString(),
            });
          } else {
            this.logger.warn(`跳过无法解密的 API 账户 ${item.id}`);
          }
        } catch (error) {
          this.logger.error(`解密 API 账户 ${item.id} 失败，已跳过: ${(error as Error).message}`);
        }
      }

      this.logger.log(`已加载 ${this.accounts.size} 个 API 账户`);
      if (needsRewrite) {
        this.save();
        this.logger.warn('检测到旧版明文 API 密钥，已加密重写 accounts.json');
      }
    } catch (err) {
      this.logger.error(`加载 API 账户失败: ${(err as Error).message}`);
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const arr: PersistedAccount[] = Array.from(this.accounts.values()).map((account) => {
        const aadBase = `${account.id}:${account.userId}:${account.exchange}`;
        return {
          id: account.id,
          userId: account.userId,
          exchange: account.exchange,
          label: account.label,
          apiKeyCipher: this.cryptoService.encrypt(account.apiKey, `${aadBase}:apiKey`),
          apiSecretCipher: this.cryptoService.encrypt(account.apiSecret, `${aadBase}:apiSecret`),
          passphraseCipher: this.cryptoService.encrypt(account.passphrase, `${aadBase}:passphrase`),
          apiKeyMasked: account.apiKeyMasked || this.cryptoService.mask(account.apiKey),
          apiKeyFingerprint:
            account.apiKeyFingerprint || this.cryptoService.fingerprint(account.apiKey),
          permissions: account.permissions || [],
          isTestnet: account.isTestnet,
          status: account.status,
          lastTestAt: account.lastTestAt,
          lastSyncAt: account.lastSyncAt,
          createdAt: account.createdAt,
        };
      });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), { encoding: 'utf-8', mode: 0o600 });
      try {
        fs.renameSync(tmp, this.filePath);
      } catch {
        if (fs.existsSync(this.filePath)) fs.rmSync(this.filePath, { force: true });
        fs.renameSync(tmp, this.filePath);
      }
      try {
        fs.chmodSync(this.filePath, 0o600);
      } catch {
        // Windows 下 chmod 可能不生效，忽略。
      }
    } catch (err) {
      this.logger.error(`保存 API 账户失败: ${(err as Error).message}`);
    }
  }

  set(id: string, account: StoredAccount) {
    this.accounts.set(id, {
      ...account,
      apiKeyMasked: account.apiKeyMasked || this.cryptoService.mask(account.apiKey),
      apiKeyFingerprint:
        account.apiKeyFingerprint || this.cryptoService.fingerprint(account.apiKey),
    });
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

  /** 可安全返回给前端的字段，绝不包含 apiKey/apiSecret/passphrase。 */
  publicView(account: StoredAccount) {
    return {
      id: account.id,
      exchange: account.exchange,
      label: account.label,
      apiKeyMasked: account.apiKeyMasked,
      apiKeyFingerprint: account.apiKeyFingerprint,
      permissions: account.permissions || [],
      isTestnet: account.isTestnet,
      status: account.status,
      lastTestAt: account.lastTestAt,
      lastSyncAt: account.lastSyncAt,
    };
  }
}
