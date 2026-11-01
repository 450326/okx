import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const KEY_FILE = path.resolve(__dirname, '../../../data/account-encryption.key');

/**
 * 交易所 API 密钥加密。
 *
 * 主密钥优先来自 ACCOUNT_ENCRYPTION_KEY（64 位 hex 或 32 字节 base64）。
 * 开发环境没有环境变量时回退到 data/account-encryption.key；生产环境应使用
 * 环境变量/系统密钥库，并且不要把这个 key 文件与 accounts.json 放在同一备份里。
 */
@Injectable()
export class AccountCryptoService {
  private readonly logger = new Logger(AccountCryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const configured = process.env.ACCOUNT_ENCRYPTION_KEY;
    if (configured) {
      this.key = this.decodeKey(configured);
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 ACCOUNT_ENCRYPTION_KEY（64 位 hex 或 32 字节 base64）');
    }

    if (fs.existsSync(KEY_FILE)) {
      this.key = this.decodeKey(fs.readFileSync(KEY_FILE, 'utf-8').trim());
      return;
    }

    this.key = crypto.randomBytes(32);
    const dir = path.dirname(KEY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEY_FILE, this.key.toString('base64'), { encoding: 'utf-8', mode: 0o600 });
    this.logger.warn(
      '未设置 ACCOUNT_ENCRYPTION_KEY，已生成 data/account-encryption.key；生产环境请改用环境变量或系统密钥库',
    );
  }

  encrypt(plaintext: string, aad: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(payload: string, aad: string): string {
    const parts = String(payload || '').split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('不支持的密文格式');
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const encrypted = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  fingerprint(secret: string): string {
    return crypto.createHash('sha256').update(secret || '').digest('hex').slice(0, 16);
  }

  mask(secret: string): string {
    const value = String(secret || '');
    if (!value) return '****';
    return value.length <= 4 ? '****' : `****${value.slice(-4)}`;
  }

  private decodeKey(value: string): Buffer {
    const raw = value.trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
    throw new Error('ACCOUNT_ENCRYPTION_KEY 必须是 64 位 hex 或 32 字节 base64');
  }
}
