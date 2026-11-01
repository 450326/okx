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
  createdAt: string;
}

interface StoredUserRow {
  id: string;
  email: string;
  nickname: string;
  password_hash: string | null;
  is_guest: number;
  is_super: number;
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
          `INSERT INTO users (id,email,nickname,password_hash,is_guest,is_super,created_at)
           VALUES (?,?,?,?,?,?,?)`,
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
  }): AuthUser {
    const now = new Date().toISOString();
    const id = randomId(input.isGuest ? 'u_guest_' : 'u_');
    this.db
      .prepare(
        `INSERT INTO users (id,email,nickname,password_hash,is_guest,is_super,created_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.email,
        input.nickname,
        input.password ? hashPassword(input.password) : null,
        input.isGuest ? 1 : 0,
        input.isSuper ? 1 : 0,
        now,
      );
    return this.findById(id)!;
  }

  verifyLogin(email: string, password: string): AuthUser | null {
    const user = this.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    const { passwordHash: _passwordHash, ...authUser } = user;
    return authUser;
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

  revokeAllForUser(userId: string): void {
    this.db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
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
      createdAt: row.created_at,
    };
  }
}
