import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const { DatabaseSync } = require('node:sqlite');

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  isGuest: boolean;
  isSuper: boolean;
  emailVerified: boolean;
  totpEnabled: boolean;
  tokenVersion: number;
  guestExpiresAt: string | null;
  createdAt: string;
}

interface StoredUserRow {
  id: string;
  email: string;
  nickname: string;
  password_hash: string | null;
  is_guest: number;
  is_super: number;
  email_verified: number;
  totp_enabled: number;
  token_version: number;
  guest_expires_at: string | null;
  created_at: string;
}

function randomId(prefix: string): string {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

@Injectable()
export class AuthStore {
  private readonly logger = new Logger(AuthStore.name);
  private readonly db: any;
  private readonly filePath: string;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../data/app.db');
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.migrate();
    this.seed();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nickname TEXT NOT NULL,
        password_hash TEXT,
        is_guest INTEGER NOT NULL DEFAULT 0,
        is_super INTEGER NOT NULL DEFAULT 0,
        email_verified INTEGER NOT NULL DEFAULT 0,
        email_verification_token_hash TEXT,
        email_verification_expires_at TEXT,
        password_reset_token_hash TEXT,
        password_reset_expires_at TEXT,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        token_version INTEGER NOT NULL DEFAULT 0,
        guest_expires_at TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        replaced_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    `);

    // 兼容上一版 app.db：逐列补齐，避免用户升级时丢数据。
    this.ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('users', 'email_verification_token_hash', 'TEXT');
    this.ensureColumn('users', 'email_verification_expires_at', 'TEXT');
    this.ensureColumn('users', 'password_reset_token_hash', 'TEXT');
    this.ensureColumn('users', 'password_reset_expires_at', 'TEXT');
    this.ensureColumn('users', 'totp_secret', 'TEXT');
    this.ensureColumn('users', 'totp_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('users', 'guest_expires_at', 'TEXT');
    this.ensureColumn('users', 'last_login_at', 'TEXT');
    this.db
      .prepare('UPDATE users SET email_verified = 1 WHERE email IN (?, ?)')
      .run('demo@test.com', 'super@test.com');

    const legacyGuests = this.db
      .prepare("SELECT id, created_at FROM users WHERE is_guest = 1 AND guest_expires_at IS NULL")
      .all() as { id: string; created_at: string }[];
    for (const guest of legacyGuests) {
      const created = new Date(guest.created_at).getTime();
      const expires = new Date((Number.isFinite(created) ? created : Date.now()) + 7 * 24 * 60 * 60 * 1000);
      this.db.prepare('UPDATE users SET guest_expires_at = ? WHERE id = ?').run(expires.toISOString(), guest.id);
    }
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((item) => item.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private seed(): void {
    const now = new Date().toISOString();
    const seedUsers = [
      { id: 'u_demo', email: 'demo@test.com', nickname: 'Demo User', password: 'demo', isSuper: 0 },
      { id: 'u_super', email: 'super@test.com', nickname: 'Super Admin', password: 'super', isSuper: 1 },
    ];
    for (const user of seedUsers) {
      const existing = this.findById(user.id);
      if (existing) continue;
      this.db
        .prepare(
          `INSERT INTO users (id,email,nickname,password_hash,is_guest,is_super,email_verified,created_at)
           VALUES (?,?,?,?,?,?,1,?)`,
        )
        .run(user.id, user.email, user.nickname, hashPassword(user.password), 0, user.isSuper, now);
      this.logger.log(`已创建种子账号 ${user.email}`);
    }
  }

  findByEmail(email: string): (AuthUser & { passwordHash: string | null }) | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as StoredUserRow | undefined;
    return row ? this.withPassword(row) : null;
  }

  findById(id: string): AuthUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as StoredUserRow | undefined;
    return row ? this.toUser(row) : null;
  }

  createUser(input: {
    email: string;
    nickname: string;
    password?: string;
    isGuest?: boolean;
    isSuper?: boolean;
    emailVerified?: boolean;
  }): AuthUser {
    const now = new Date().toISOString();
    const id = randomId(input.isGuest ? 'u_guest_' : 'u_');
    const guestExpiresAt = input.isGuest
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    this.db
      .prepare(
        `INSERT INTO users (id,email,nickname,password_hash,is_guest,is_super,email_verified,guest_expires_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.email,
        input.nickname,
        input.password ? hashPassword(input.password) : null,
        input.isGuest ? 1 : 0,
        input.isSuper ? 1 : 0,
        input.emailVerified ? 1 : 0,
        guestExpiresAt,
        now,
      );
    return this.findById(id)!;
  }

  verifyLogin(email: string, password: string): AuthUser | null {
    const user = this.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    const { passwordHash: _passwordHash, ...authUser } = user;
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), authUser.id);
    return authUser;
  }

  setVerificationToken(userId: string, hash: string, expiresAt: string): void {
    this.db
      .prepare('UPDATE users SET email_verification_token_hash = ?, email_verification_expires_at = ? WHERE id = ?')
      .run(hash, expiresAt, userId);
  }

  findByVerificationToken(hash: string): AuthUser | null {
    const row = this.db
      .prepare(
        'SELECT * FROM users WHERE email_verification_token_hash = ? AND email_verification_expires_at > ?',
      )
      .get(hash, new Date().toISOString()) as StoredUserRow | undefined;
    return row ? this.toUser(row) : null;
  }

  markEmailVerified(userId: string): AuthUser | null {
    this.db
      .prepare(
        'UPDATE users SET email_verified = 1, email_verification_token_hash = NULL, email_verification_expires_at = NULL WHERE id = ?',
      )
      .run(userId);
    return this.findById(userId);
  }

  setPasswordResetToken(userId: string, hash: string, expiresAt: string): void {
    this.db
      .prepare('UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ? WHERE id = ?')
      .run(hash, expiresAt, userId);
  }

  findByPasswordResetToken(hash: string): AuthUser | null {
    const row = this.db
      .prepare(
        'SELECT * FROM users WHERE password_reset_token_hash = ? AND password_reset_expires_at > ?',
      )
      .get(hash, new Date().toISOString()) as StoredUserRow | undefined;
    return row ? this.toUser(row) : null;
  }

  updatePassword(userId: string, password: string): void {
    this.db
      .prepare(
        'UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL, token_version = token_version + 1 WHERE id = ?',
      )
      .run(hashPassword(password), userId);
  }

  setTotpSecret(userId: string, secret: string): void {
    this.db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, userId);
  }

  setTotpEnabled(userId: string, enabled: boolean): AuthUser | null {
    this.db.prepare('UPDATE users SET totp_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, userId);
    if (!enabled) this.db.prepare('UPDATE users SET totp_secret = NULL WHERE id = ?').run(userId);
    return this.findById(userId);
  }

  getTotpSecret(userId: string): string | null {
    const row = this.db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as
      | { totp_secret: string | null }
      | undefined;
    return row?.totp_secret || null;
  }

  bumpTokenVersion(userId: string): AuthUser | null {
    this.db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
    return this.findById(userId);
  }

  revokeAllForUser(userId: string): void {
    this.db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
  }

  listExpiredGuests(now = new Date()): string[] {
    const rows = this.db
      .prepare('SELECT id FROM users WHERE is_guest = 1 AND guest_expires_at IS NOT NULL AND guest_expires_at <= ?')
      .all(now.toISOString()) as { id: string }[];
    return rows.map((row) => row.id);
  }

  deleteUser(userId: string): void {
    this.db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  createRefreshToken(userId: string, tokenHash: string, expiresAt: string): string {
    const id = randomId('rt_');
    this.db
      .prepare(
        `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,revoked,created_at)
         VALUES (?,?,?,?,0,?)`,
      )
      .run(id, userId, tokenHash, expiresAt, new Date().toISOString());
    return id;
  }

  consumeRefreshToken(tokenHash: string): { user: AuthUser; tokenId: string } | null {
    const row = this.db
      .prepare(
        `SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > ?`,
      )
      .get(tokenHash, new Date().toISOString()) as
      | { id: string; user_id: string }
      | undefined;
    if (!row) return null;
    const user = this.findById(row.user_id);
    if (!user) return null;
    this.db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);
    return { user, tokenId: row.id };
  }

  revokeRefreshToken(tokenHash: string): void {
    this.db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
  }

  private withPassword(row: StoredUserRow): AuthUser & { passwordHash: string | null } {
    return {
      ...this.toUser(row),
      passwordHash: row.password_hash,
    };
  }

  private toUser(row: StoredUserRow): AuthUser {
    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      isGuest: Boolean(row.is_guest),
      isSuper: Boolean(row.is_super),
      emailVerified: Boolean(row.email_verified),
      totpEnabled: Boolean(row.totp_enabled),
      tokenVersion: Number(row.token_version) || 0,
      guestExpiresAt: row.guest_expires_at || null,
      createdAt: row.created_at,
    };
  }
}
