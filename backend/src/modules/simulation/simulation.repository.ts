import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  SimAccountState,
  SimLedgerEntry,
  SimOrder,
  SimPosition,
  SimPredictionOrder,
  SimPredictionPosition,
  SimSpotHolding,
  SimSpotOrder,
} from './simulation.types';
import { fromUnits, toUnits } from '../../common/money';
import { requireNodeSqlite } from '../../common/node-runtime';

export interface RiskEventRecord {
  id: string;
  userId: string;
  positionId: string;
  orderId: string;
  symbol: string;
  side: string;
  triggerType: 'liquidation' | 'take_profit' | 'stop_loss';
  triggerPrice: number;
  executionPrice: number;
  marginRatio: number;
  qty: number;
  realizedPnl: number;
  ledgerId: string | null;
  createdAt: string;
}

// 旧版 Node 上给出可读提示，而不是裸的 "Cannot find module 'node:sqlite'"
const { DatabaseSync } = requireNodeSqlite();

interface UserAccountRow {
  user_id: string;
  initial_capital: number;
  wallet_balance: number;
  realized_pnl: number;
  contract_realized_pnl: number;
  spot_realized_pnl: number;
  prediction_realized_pnl: number;
  total_fee: number;
  next_order_id: number;
  next_position_id: number;
  next_spot_holding_id: number;
  next_spot_order_id: number;
  next_prediction_order_id: number;
  next_prediction_position_id: number;
  next_ledger_id: number;
  updated_at: string;
}

@Injectable()
export class SimulationRepository {
  private readonly logger = new Logger(SimulationRepository.name);
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
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sim_accounts (
        user_id TEXT PRIMARY KEY,
        initial_capital REAL NOT NULL,
        wallet_balance REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        contract_realized_pnl REAL NOT NULL DEFAULT 0,
        spot_realized_pnl REAL NOT NULL DEFAULT 0,
        prediction_realized_pnl REAL NOT NULL DEFAULT 0,
        total_fee REAL NOT NULL DEFAULT 0,
        next_order_id INTEGER NOT NULL,
        next_position_id INTEGER NOT NULL,
        next_spot_holding_id INTEGER NOT NULL,
        next_spot_order_id INTEGER NOT NULL,
        next_prediction_order_id INTEGER NOT NULL,
        next_prediction_position_id INTEGER NOT NULL,
        next_ledger_id INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_positions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        leverage REAL NOT NULL,
        margin_mode TEXT NOT NULL DEFAULT 'isolated',
        qty REAL NOT NULL,
        entry_price REAL NOT NULL,
        margin REAL NOT NULL,
        realized_pnl REAL NOT NULL DEFAULT 0,
        funding_fee REAL NOT NULL DEFAULT 0,
        last_funding_at TEXT,
        take_profit_price REAL,
        stop_loss_price REAL,
        status TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        closed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sim_orders (
        order_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        action TEXT NOT NULL,
        order_type TEXT NOT NULL,
        leverage REAL NOT NULL,
        margin_mode TEXT NOT NULL DEFAULT 'isolated',
        qty REAL NOT NULL,
        price REAL,
        status TEXT NOT NULL,
        filled_qty REAL NOT NULL DEFAULT 0,
        avg_fill_price REAL,
        fee REAL NOT NULL DEFAULT 0,
        reserved_margin REAL NOT NULL DEFAULT 0,
        reduce_only INTEGER NOT NULL DEFAULT 0,
        take_profit_price REAL,
        stop_loss_price REAL,
        source TEXT NOT NULL,
        position_id TEXT,
        reject_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        filled_at TEXT,
        trigger_price REAL,
        margin_ratio_at_trigger REAL
      );

      CREATE TABLE IF NOT EXISTS sim_spot_holdings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        base_coin TEXT NOT NULL,
        qty REAL NOT NULL,
        avg_cost REAL NOT NULL,
        opened_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_spot_orders (
        order_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        base_coin TEXT NOT NULL,
        side TEXT NOT NULL,
        qty REAL NOT NULL,
        price REAL NOT NULL,
        notional REAL NOT NULL,
        fee REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_prediction_positions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        market_id TEXT NOT NULL,
        question TEXT NOT NULL,
        event_title TEXT NOT NULL,
        icon TEXT NOT NULL,
        outcome TEXT NOT NULL,
        outcome_name TEXT NOT NULL,
        token_id TEXT NOT NULL,
        qty REAL NOT NULL,
        entry_price REAL NOT NULL,
        status TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_prediction_orders (
        order_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        market_id TEXT NOT NULL,
        question TEXT NOT NULL,
        outcome TEXT NOT NULL,
        outcome_name TEXT NOT NULL,
        action TEXT NOT NULL,
        qty REAL NOT NULL,
        price REAL NOT NULL,
        notional REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        status TEXT NOT NULL,
        position_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        balance_after REAL NOT NULL,
        symbol TEXT,
        order_id TEXT,
        position_id TEXT,
        remark TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_equity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        equity REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_funding_rates (
        symbol TEXT PRIMARY KEY,
        funding_rate REAL NOT NULL,
        funding_time INTEGER NOT NULL,
        next_funding_time INTEGER NOT NULL,
        source TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sim_funding_settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        position_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        funding_time INTEGER NOT NULL,
        funding_rate REAL NOT NULL,
        notional REAL NOT NULL,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, position_id, funding_time)
      );

      CREATE TABLE IF NOT EXISTS risk_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        position_id TEXT NOT NULL,
        order_id TEXT NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_price REAL NOT NULL,
        execution_price REAL NOT NULL,
        margin_ratio REAL NOT NULL,
        qty REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        ledger_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sim_positions_user ON sim_positions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_orders_user ON sim_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_ledger_user ON sim_ledger(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_spot_user ON sim_spot_holdings(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_prediction_user ON sim_prediction_positions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sim_equity_user ON sim_equity_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_risk_events_user ON risk_events(user_id, created_at);
    `);
    this.ensureColumn('sim_positions', 'funding_fee', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('sim_positions', 'last_funding_at', 'TEXT');
    this.ensureColumn('sim_positions', 'margin_mode', "TEXT NOT NULL DEFAULT 'isolated'");
    this.ensureColumn('sim_orders', 'margin_mode', "TEXT NOT NULL DEFAULT 'isolated'");
    this.ensureColumn('sim_orders', 'trigger_price', 'REAL');
    this.ensureColumn('sim_orders', 'margin_ratio_at_trigger', 'REAL');
    this.migrateMoneyUnits();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  /** 旧库金额是十进制浮点，升级到 1e-8 最小单位后只转换一次。 */
  private migrateMoneyUnits(): void {
    const meta = this.db.prepare("SELECT value FROM sim_meta WHERE key = 'money_units'").get() as
      | { value: string }
      | undefined;
    if (meta?.value === '1') return;

    const columns: Array<[string, string[]]> = [
      ['sim_accounts', ['initial_capital', 'wallet_balance', 'realized_pnl', 'contract_realized_pnl', 'spot_realized_pnl', 'prediction_realized_pnl', 'total_fee']],
      ['sim_positions', ['margin', 'realized_pnl']],
      ['sim_orders', ['fee', 'reserved_margin']],
      ['sim_spot_orders', ['notional', 'fee', 'realized_pnl']],
      ['sim_prediction_orders', ['notional', 'realized_pnl']],
      ['sim_ledger', ['amount', 'balance_after']],
      ['sim_equity_history', ['equity']],
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [table, fields] of columns) {
        for (const field of fields) {
          this.db.exec(`UPDATE ${table} SET ${field} = ROUND(${field} * 100000000) WHERE ${field} IS NOT NULL`);
        }
      }
      this.db
        .prepare("INSERT INTO sim_meta (key,value) VALUES ('money_units','1') ON CONFLICT(key) DO UPDATE SET value='1'")
        .run();
      this.db.exec('COMMIT');
      this.logger.log('模拟账本金额已迁移到 1e-8 最小单位');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  hasAccount(userId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM sim_accounts WHERE user_id = ?').get(userId));
  }

  listUserIds(): string[] {
    const rows = this.db.prepare('SELECT user_id FROM sim_accounts').all() as { user_id: string }[];
    return rows.map((row) => row.user_id);
  }

  load(userId: string): SimAccountState | undefined {
    const account = this.db
      .prepare('SELECT * FROM sim_accounts WHERE user_id = ?')
      .get(userId) as UserAccountRow | undefined;
    if (!account) return undefined;

    const positions = this.db.prepare('SELECT * FROM sim_positions WHERE user_id = ?').all(userId) as any[];
    const orders = this.db.prepare('SELECT * FROM sim_orders WHERE user_id = ?').all(userId) as any[];
    const spotHoldings = this.db.prepare('SELECT * FROM sim_spot_holdings WHERE user_id = ?').all(userId) as any[];
    const spotOrders = this.db.prepare('SELECT * FROM sim_spot_orders WHERE user_id = ?').all(userId) as any[];
    const predictionPositions = this.db.prepare('SELECT * FROM sim_prediction_positions WHERE user_id = ?').all(userId) as any[];
    const predictionOrders = this.db.prepare('SELECT * FROM sim_prediction_orders WHERE user_id = ?').all(userId) as any[];
    const ledger = this.db.prepare('SELECT * FROM sim_ledger WHERE user_id = ? ORDER BY created_at ASC').all(userId) as any[];
    const equity = this.db.prepare('SELECT ts,equity FROM sim_equity_history WHERE user_id = ? ORDER BY ts ASC').all(userId) as any[];

    return {
      version: 2,
      initialCapital: this.readMoney(account.initial_capital),
      walletBalance: this.readMoney(account.wallet_balance),
      realizedPnl: this.readMoney(account.realized_pnl),
      contractRealizedPnl: this.readMoney(account.contract_realized_pnl),
      spotRealizedPnl: this.readMoney(account.spot_realized_pnl),
      predictionRealizedPnl: this.readMoney(account.prediction_realized_pnl),
      totalFee: this.readMoney(account.total_fee),
      positions: positions.map((row) => this.mapPosition(row)),
      orders: orders.map((row) => this.mapOrder(row)),
      spotHoldings: spotHoldings.map((row) => this.mapSpotHolding(row)),
      spotOrders: spotOrders.map((row) => this.mapSpotOrder(row)),
      predictionPositions: predictionPositions.map((row) => this.mapPredictionPosition(row)),
      predictionOrders: predictionOrders.map((row) => this.mapPredictionOrder(row)),
      ledger: ledger.map((row) => this.mapLedger(row)),
      equityHistory: equity.map((item) => ({ ts: Number(item.ts), equity: this.readMoney(item.equity) })),
      nextOrderId: Number(account.next_order_id),
      nextPositionId: Number(account.next_position_id),
      nextSpotHoldingId: Number(account.next_spot_holding_id),
      nextSpotOrderId: Number(account.next_spot_order_id),
      nextPredictionOrderId: Number(account.next_prediction_order_id),
      nextPredictionPositionId: Number(account.next_prediction_position_id),
      nextLedgerId: Number(account.next_ledger_id),
      updatedAt: account.updated_at,
    };
  }

  save(userId: string, state: SimAccountState): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT INTO sim_accounts (
            user_id,initial_capital,wallet_balance,realized_pnl,contract_realized_pnl,
            spot_realized_pnl,prediction_realized_pnl,total_fee,next_order_id,
            next_position_id,next_spot_holding_id,next_spot_order_id,
            next_prediction_order_id,next_prediction_position_id,next_ledger_id,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET
            initial_capital=excluded.initial_capital,
            wallet_balance=excluded.wallet_balance,
            realized_pnl=excluded.realized_pnl,
            contract_realized_pnl=excluded.contract_realized_pnl,
            spot_realized_pnl=excluded.spot_realized_pnl,
            prediction_realized_pnl=excluded.prediction_realized_pnl,
            total_fee=excluded.total_fee,
            next_order_id=excluded.next_order_id,
            next_position_id=excluded.next_position_id,
            next_spot_holding_id=excluded.next_spot_holding_id,
            next_spot_order_id=excluded.next_spot_order_id,
            next_prediction_order_id=excluded.next_prediction_order_id,
            next_prediction_position_id=excluded.next_prediction_position_id,
            next_ledger_id=excluded.next_ledger_id,
            updated_at=excluded.updated_at`,
        )
        .run(
          userId,
          this.money(state.initialCapital),
          this.money(state.walletBalance),
          this.money(state.realizedPnl),
          this.money(state.contractRealizedPnl),
          this.money(state.spotRealizedPnl),
          this.money(state.predictionRealizedPnl),
          this.money(state.totalFee),
          state.nextOrderId,
          state.nextPositionId,
          state.nextSpotHoldingId,
          state.nextSpotOrderId,
          state.nextPredictionOrderId,
          state.nextPredictionPositionId,
          state.nextLedgerId,
          state.updatedAt,
        );

      for (const table of [
        'sim_positions',
        'sim_orders',
        'sim_spot_holdings',
        'sim_spot_orders',
        'sim_prediction_positions',
        'sim_prediction_orders',
        'sim_ledger',
        'sim_equity_history',
      ]) {
        this.db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
      }

      const positionStmt = this.db.prepare(
        `INSERT INTO sim_positions (id,user_id,symbol,side,leverage,margin_mode,qty,entry_price,margin,realized_pnl,funding_fee,last_funding_at,take_profit_price,stop_loss_price,status,opened_at,updated_at,closed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.positions) {
        positionStmt.run(
          item.id, userId, item.symbol, item.side, item.leverage, item.marginMode, item.qty, item.entryPrice,
          this.money(item.margin), this.money(item.realizedPnl), this.money(item.fundingFee || 0),
          item.lastFundingAt || null, item.takeProfitPrice, item.stopLossPrice, item.status,
          item.openedAt, item.updatedAt, item.closedAt || null,
        );
      }

      const orderStmt = this.db.prepare(
        `INSERT INTO sim_orders (order_id,user_id,symbol,side,action,order_type,leverage,margin_mode,qty,price,status,filled_qty,avg_fill_price,fee,reserved_margin,reduce_only,take_profit_price,stop_loss_price,source,position_id,reject_reason,created_at,updated_at,filled_at,trigger_price,margin_ratio_at_trigger)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.orders) {
        orderStmt.run(
          item.orderId, userId, item.symbol, item.side, item.action, item.orderType,
          item.leverage, item.marginMode, item.qty, item.price, item.status, item.filledQty, item.avgFillPrice,
          this.money(item.fee), this.money(item.reservedMargin), item.reduceOnly ? 1 : 0, item.takeProfitPrice,
          item.stopLossPrice, item.source, item.positionId || null, item.rejectReason || null,
          item.createdAt, item.updatedAt, item.filledAt || null,
          item.triggerPrice ?? null, item.marginRatioAtTrigger ?? null,
        );
      }

      const spotHoldingStmt = this.db.prepare(
        `INSERT INTO sim_spot_holdings (id,user_id,symbol,base_coin,qty,avg_cost,opened_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.spotHoldings) {
        spotHoldingStmt.run(item.id, userId, item.symbol, item.baseCoin, item.qty, item.avgCost, item.openedAt, item.updatedAt);
      }

      const spotOrderStmt = this.db.prepare(
        `INSERT INTO sim_spot_orders (order_id,user_id,symbol,base_coin,side,qty,price,notional,fee,realized_pnl,status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.spotOrders) {
        spotOrderStmt.run(item.orderId, userId, item.symbol, item.baseCoin, item.side, item.qty, item.price, this.money(item.notional), this.money(item.fee), this.money(item.realizedPnl), item.status, item.createdAt);
      }

      const predictionPositionStmt = this.db.prepare(
        `INSERT INTO sim_prediction_positions (id,user_id,slug,market_id,question,event_title,icon,outcome,outcome_name,token_id,qty,entry_price,status,opened_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.predictionPositions) {
        predictionPositionStmt.run(item.id, userId, item.slug, item.marketId, item.question, item.eventTitle, item.icon, item.outcome, item.outcomeName, item.tokenId, item.qty, item.entryPrice, item.status, item.openedAt, item.updatedAt);
      }

      const predictionOrderStmt = this.db.prepare(
        `INSERT INTO sim_prediction_orders (order_id,user_id,slug,market_id,question,outcome,outcome_name,action,qty,price,notional,realized_pnl,status,position_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.predictionOrders) {
        predictionOrderStmt.run(item.orderId, userId, item.slug, item.marketId, item.question, item.outcome, item.outcomeName, item.action, item.qty, item.price, this.money(item.notional), this.money(item.realizedPnl), item.status, item.positionId, item.createdAt);
      }

      const ledgerStmt = this.db.prepare(
        `INSERT INTO sim_ledger (id,user_id,type,amount,balance_after,symbol,order_id,position_id,remark,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const item of state.ledger) {
        ledgerStmt.run(item.id, userId, item.type, this.money(item.amount), this.money(item.balanceAfter), item.symbol || null, item.orderId || null, item.positionId || null, item.remark || null, item.createdAt);
      }

      const equityStmt = this.db.prepare('INSERT INTO sim_equity_history (user_id,ts,equity) VALUES (?,?,?)');
      for (const item of state.equityHistory) {
        equityStmt.run(userId, item.ts, this.money(item.equity));
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** 从流水重算钱包余额，并返回与当前快照的差异。 */
  verifyLedger(userId: string): { ledgerSum: number; walletBalance: number; diff: number } | null {
    const account = this.db
      .prepare('SELECT wallet_balance FROM sim_accounts WHERE user_id = ?')
      .get(userId) as { wallet_balance: number } | undefined;
    if (!account) return null;
    const row = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM sim_ledger WHERE user_id = ?')
      .get(userId) as { total: number };
    const ledgerSum = this.readMoney(row.total);
    const walletBalance = this.readMoney(account.wallet_balance);
    return {
      ledgerSum,
      walletBalance,
      diff: Number((walletBalance - ledgerSum).toFixed(8)),
    };
  }

  /** 以流水为准重建钱包余额。用于迁移校验和显式对账。 */
  rebuildWallet(userId: string): { ledgerSum: number; walletBalance: number } | null {
    const result = this.verifyLedger(userId);
    if (!result) return null;
    this.db
      .prepare('UPDATE sim_accounts SET wallet_balance = ?, updated_at = ? WHERE user_id = ?')
      .run(this.money(result.ledgerSum), new Date().toISOString(), userId);
    return { ledgerSum: result.ledgerSum, walletBalance: result.ledgerSum };
  }

  migrateFromJson(userId: string, filePath: string): SimAccountState | undefined {
    try {
      if (!fs.existsSync(filePath)) return undefined;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const state = parsed?.version === 2 && parsed.account ? (parsed.account as SimAccountState) : undefined;
      if (!state) return undefined;
      if (!this.hasAccount(userId)) this.save(userId, state);
      return state;
    } catch (error) {
      this.logger.warn(`迁移 JSON 账本失败 ${filePath}: ${(error as Error).message}`);
      return undefined;
    }
  }

  saveFundingRate(snapshot: {
    symbol: string;
    fundingRate: number;
    fundingTime: number;
    nextFundingTime: number;
    source: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO sim_funding_rates (symbol,funding_rate,funding_time,next_funding_time,source,fetched_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(symbol) DO UPDATE SET
           funding_rate=excluded.funding_rate,
           funding_time=excluded.funding_time,
           next_funding_time=excluded.next_funding_time,
           source=excluded.source,
           fetched_at=excluded.fetched_at`,
      )
      .run(
        snapshot.symbol,
        snapshot.fundingRate,
        snapshot.fundingTime,
        snapshot.nextFundingTime,
        snapshot.source,
        new Date().toISOString(),
      );
  }

  hasFundingSettlement(userId: string, positionId: string, fundingTime: number): boolean {
    return Boolean(
      this.db
        .prepare(
          'SELECT 1 FROM sim_funding_settlements WHERE user_id = ? AND position_id = ? AND funding_time = ?',
        )
        .get(userId, positionId, fundingTime),
    );
  }

  recordFundingSettlement(input: {
    userId: string;
    positionId: string;
    symbol: string;
    fundingTime: number;
    fundingRate: number;
    notional: number;
    amount: number;
  }): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO sim_funding_settlements
          (user_id,position_id,symbol,funding_time,funding_rate,notional,amount,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.userId,
        input.positionId,
        input.symbol,
        input.fundingTime,
        input.fundingRate,
        this.money(input.notional),
        this.money(input.amount),
        new Date().toISOString(),
      );
    return Number(result.changes) > 0;
  }

  recordRiskEvent(input: {
    id: string;
    userId: string;
    positionId: string;
    orderId: string;
    symbol: string;
    side: string;
    triggerType: 'liquidation' | 'take_profit' | 'stop_loss';
    triggerPrice: number;
    executionPrice: number;
    marginRatio: number;
    qty: number;
    realizedPnl: number;
    ledgerId?: string | null;
    createdAt: string;
  }): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO risk_events
          (id,user_id,position_id,order_id,symbol,side,trigger_type,trigger_price,execution_price,margin_ratio,qty,realized_pnl,ledger_id,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
        input.userId,
        input.positionId,
        input.orderId,
        input.symbol,
        input.side,
        input.triggerType,
        input.triggerPrice,
        input.executionPrice,
        input.marginRatio,
        input.qty,
        this.money(input.realizedPnl),
        input.ledgerId || null,
        input.createdAt,
      );
    return Number(result.changes) > 0;
  }

  listRiskEvents(userId: string, limit = 50): RiskEventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM risk_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, Math.max(1, Math.min(200, limit))) as any[];
    return rows.map((row) => this.mapRiskEvent(row));
  }

  listAllRiskEvents(limit = 200): RiskEventRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM risk_events ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(500, limit))) as any[];
    return rows.map((row) => this.mapRiskEvent(row));
  }

  riskStats(): {
    total: number;
    liquidation: number;
    takeProfit: number;
    stopLoss: number;
    liquidationRate: number;
  } {
    const rows = this.db
      .prepare('SELECT trigger_type AS type, COUNT(*) AS count FROM risk_events GROUP BY trigger_type')
      .all() as Array<{ type: string; count: number }>;
    const count = (type: string) => Number(rows.find((row) => row.type === type)?.count || 0);
    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
    const liquidation = count('liquidation');
    return {
      total,
      liquidation,
      takeProfit: count('take_profit'),
      stopLoss: count('stop_loss'),
      liquidationRate: total ? Number(((liquidation / total) * 100).toFixed(2)) : 0,
    };
  }

  private mapRiskEvent(row: any): RiskEventRecord {
    return {
      id: row.id,
      userId: row.user_id,
      positionId: row.position_id,
      orderId: row.order_id,
      symbol: row.symbol,
      side: row.side,
      triggerType: row.trigger_type,
      triggerPrice: Number(row.trigger_price),
      executionPrice: Number(row.execution_price),
      marginRatio: Number(row.margin_ratio),
      qty: Number(row.qty),
      realizedPnl: this.readMoney(row.realized_pnl),
      ledgerId: row.ledger_id || null,
      createdAt: row.created_at,
    };
  }

  private mapPosition(row: any): SimPosition {
    return {
      id: row.id,
      symbol: row.symbol,
      side: row.side,
      leverage: Number(row.leverage),
      marginMode: row.margin_mode === 'cross' ? 'cross' : 'isolated',
      qty: Number(row.qty),
      entryPrice: Number(row.entry_price),
      margin: this.readMoney(row.margin),
      realizedPnl: this.readMoney(row.realized_pnl),
      fundingFee: this.readMoney(row.funding_fee || 0),
      lastFundingAt: row.last_funding_at || null,
      takeProfitPrice: row.take_profit_price == null ? null : Number(row.take_profit_price),
      stopLossPrice: row.stop_loss_price == null ? null : Number(row.stop_loss_price),
      status: row.status,
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at || null,
    };
  }

  private mapOrder(row: any): SimOrder {
    return {
      orderId: row.order_id,
      symbol: row.symbol,
      side: row.side,
      action: row.action,
      orderType: row.order_type,
      leverage: Number(row.leverage),
      marginMode: row.margin_mode === 'cross' ? 'cross' : 'isolated',
      qty: Number(row.qty),
      price: row.price == null ? null : Number(row.price),
      status: row.status,
      filledQty: Number(row.filled_qty),
      avgFillPrice: row.avg_fill_price == null ? null : Number(row.avg_fill_price),
      fee: this.readMoney(row.fee),
      reservedMargin: this.readMoney(row.reserved_margin),
      reduceOnly: Boolean(row.reduce_only),
      takeProfitPrice: row.take_profit_price == null ? null : Number(row.take_profit_price),
      stopLossPrice: row.stop_loss_price == null ? null : Number(row.stop_loss_price),
      source: row.source,
      triggerPrice: row.trigger_price == null ? null : Number(row.trigger_price),
      marginRatioAtTrigger:
        row.margin_ratio_at_trigger == null ? null : Number(row.margin_ratio_at_trigger),
      positionId: row.position_id || null,
      rejectReason: row.reject_reason || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      filledAt: row.filled_at || null,
    };
  }

  private mapSpotHolding(row: any): SimSpotHolding {
    return {
      id: row.id,
      symbol: row.symbol,
      baseCoin: row.base_coin,
      qty: Number(row.qty),
      avgCost: Number(row.avg_cost),
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSpotOrder(row: any): SimSpotOrder {
    return {
      orderId: row.order_id,
      symbol: row.symbol,
      baseCoin: row.base_coin,
      side: row.side,
      qty: Number(row.qty),
      price: Number(row.price),
      notional: this.readMoney(row.notional),
      fee: this.readMoney(row.fee),
      realizedPnl: this.readMoney(row.realized_pnl),
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private mapPredictionPosition(row: any): SimPredictionPosition {
    return {
      id: row.id,
      slug: row.slug,
      marketId: row.market_id,
      question: row.question,
      eventTitle: row.event_title,
      icon: row.icon,
      outcome: row.outcome,
      outcomeName: row.outcome_name,
      tokenId: row.token_id,
      qty: Number(row.qty),
      entryPrice: Number(row.entry_price),
      status: row.status,
      openedAt: row.opened_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPredictionOrder(row: any): SimPredictionOrder {
    return {
      orderId: row.order_id,
      slug: row.slug,
      marketId: row.market_id,
      question: row.question,
      outcome: row.outcome,
      outcomeName: row.outcome_name,
      action: row.action,
      qty: Number(row.qty),
      price: Number(row.price),
      notional: this.readMoney(row.notional),
      realizedPnl: this.readMoney(row.realized_pnl),
      status: row.status,
      positionId: row.position_id,
      createdAt: row.created_at,
    };
  }

  private mapLedger(row: any): SimLedgerEntry {
    return {
      id: row.id,
      type: row.type,
      amount: this.readMoney(row.amount),
      balanceAfter: this.readMoney(row.balance_after),
      symbol: row.symbol || undefined,
      orderId: row.order_id || undefined,
      positionId: row.position_id || undefined,
      remark: row.remark || undefined,
      createdAt: row.created_at,
    };
  }

  private money(value: number): number {
    return Number(toUnits(value));
  }

  private readMoney(value: number): number {
    return fromUnits(BigInt(Math.round(Number(value))));
  }
}
