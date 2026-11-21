import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { requireNodeSqlite } from '../../common/node-runtime';

// 旧版 Node 上给出可读提示，而不是裸的 "Cannot find module 'node:sqlite'"
const { DatabaseSync } = requireNodeSqlite();

export interface LiveOrderRecord {
  userId: string;
  clientOrderId: string;
  requestHash: string;
  instId: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  orderType: 'market' | 'limit';
  marginMode?: 'cross' | 'isolated';
  qty: string;
  price: string | null;
  leverage: number;
  exchangeOrderId: string | null;
  localStatus: string;
  exchangeStatus: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_ORDERS = 1000;
const LEGACY_FILE = 'live-orders.json';

/**
 * 实盘订单映射（clientOrderId -> 交易所订单）落到与模拟账本、账户同一份
 * `data/app.db`（WAL + busy_timeout）。
 *
 * 旧实现每次 save 都整份重写 JSON：进程崩溃或断电会留下半截文件，多实例部署时
 * 各自持有内存副本还会互相覆盖。改成 SQLite 后写操作是事务性的，主键
 * (user_id, client_order_id) 也顺带修掉了"不同用户复用同一 clientOrderId 会互相覆盖"
 * 的问题 —— OKX 的 clOrdId 只在一个 API 账户内唯一。
 */
@Injectable()
export class LiveOrderStore {
  private readonly logger = new Logger(LiveOrderStore.name);
  private readonly db: any;
  private readonly filePath: string;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../data/app.db');
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.migrate();
    this.importLegacyJson();
  }

  get(clientOrderId: string, userId: string): LiveOrderRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM live_orders WHERE user_id = ? AND client_order_id = ?')
      .get(userId, clientOrderId);
    return row ? this.mapRow(row) : undefined;
  }

  findByExchangeOrderId(orderId: string, userId: string): LiveOrderRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM live_orders
          WHERE user_id = ? AND exchange_order_id = ?
          ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(userId, orderId);
    return row ? this.mapRow(row) : undefined;
  }

  list(userId: string): LiveOrderRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM live_orders
          WHERE user_id = ?
          ORDER BY created_at DESC, updated_at DESC`,
      )
      .all(userId);
    return (rows as any[]).map((row) => this.mapRow(row));
  }

  save(record: LiveOrderRecord): LiveOrderRecord {
    this.db
      .prepare(
        `INSERT INTO live_orders (
           user_id, client_order_id, request_hash, inst_id, side, action, order_type,
           margin_mode, qty, price, leverage, exchange_order_id, local_status,
           exchange_status, error_message, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, client_order_id) DO UPDATE SET
           request_hash = excluded.request_hash,
           inst_id = excluded.inst_id,
           side = excluded.side,
           action = excluded.action,
           order_type = excluded.order_type,
           margin_mode = excluded.margin_mode,
           qty = excluded.qty,
           price = excluded.price,
           leverage = excluded.leverage,
           exchange_order_id = excluded.exchange_order_id,
           local_status = excluded.local_status,
           exchange_status = excluded.exchange_status,
           error_message = excluded.error_message,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.userId,
        record.clientOrderId,
        record.requestHash,
        record.instId,
        record.side,
        record.action,
        record.orderType,
        record.marginMode ?? null,
        record.qty,
        record.price ?? null,
        record.leverage,
        record.exchangeOrderId ?? null,
        record.localStatus,
        record.exchangeStatus ?? null,
        record.errorMessage ?? null,
        record.createdAt,
        record.updatedAt,
      );
    this.trim();
    return record;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS live_orders (
        user_id TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        inst_id TEXT NOT NULL,
        side TEXT NOT NULL,
        action TEXT NOT NULL,
        order_type TEXT NOT NULL,
        margin_mode TEXT,
        qty TEXT NOT NULL,
        price TEXT,
        leverage REAL NOT NULL,
        exchange_order_id TEXT,
        local_status TEXT NOT NULL,
        exchange_status TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, client_order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_live_orders_user_created
        ON live_orders(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_live_orders_exchange
        ON live_orders(user_id, exchange_order_id);
    `);
  }

  /** 与旧实现一致：全表只保留最近 MAX_ORDERS 条（按写入顺序） */
  private trim(): void {
    this.db
      .prepare(
        `DELETE FROM live_orders WHERE rowid NOT IN (
           SELECT rowid FROM live_orders ORDER BY rowid DESC LIMIT ?
         )`,
      )
      .run(MAX_ORDERS);
  }

  /**
   * 一次性把旧的 data/live-orders.json 导入 SQLite，成功后改名归档，
   * 失败时保留原文件并告警，不阻塞启动。
   */
  private importLegacyJson(): void {
    const legacyPath = path.resolve(path.dirname(this.filePath), LEGACY_FILE);
    if (!fs.existsSync(legacyPath)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as {
        orders?: LiveOrderRecord[];
      };
      const orders = Array.isArray(raw.orders) ? raw.orders : [];
      let imported = 0;
      let skipped = 0;

      this.db.exec('BEGIN');
      try {
        for (const order of orders) {
          if (!order?.clientOrderId || !order.instId || !order.createdAt) {
            skipped += 1;
            continue;
          }
          const now = new Date().toISOString();
          this.save({
            ...order,
            userId: order.userId || 'u_demo',
            requestHash: order.requestHash || '',
            qty: String(order.qty ?? ''),
            leverage: Number(order.leverage) || 0,
            localStatus: order.localStatus || 'unknown',
            createdAt: order.createdAt,
            updatedAt: order.updatedAt || now,
          });
          imported += 1;
        }
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }

      fs.renameSync(legacyPath, `${legacyPath}.migrated-${Date.now()}`);
      this.logger.log(
        `实盘订单映射已从 JSON 迁移到 SQLite：${imported} 条` +
          (skipped ? `，跳过 ${skipped} 条无效记录` : ''),
      );
    } catch (error) {
      this.logger.warn(`迁移 data/${LEGACY_FILE} 失败，已保留原文件: ${(error as Error).message}`);
    }
  }

  private mapRow(row: any): LiveOrderRecord {
    return {
      userId: row.user_id,
      clientOrderId: row.client_order_id,
      requestHash: row.request_hash,
      instId: row.inst_id,
      side: row.side,
      action: row.action,
      orderType: row.order_type,
      marginMode: row.margin_mode ?? undefined,
      qty: row.qty,
      price: row.price ?? null,
      leverage: Number(row.leverage),
      exchangeOrderId: row.exchange_order_id ?? null,
      localStatus: row.local_status,
      exchangeStatus: row.exchange_status ?? null,
      errorMessage: row.error_message ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
