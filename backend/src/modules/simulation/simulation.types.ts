/**
 * 模拟盘领域类型。
 *
 * 约定：
 * - 引擎内部全部使用 number，所有落盘/计算金额在写入前统一 round 到 8 位小数；
 * - 对外 API 的金额字符串由 SimulationState 负责格式化，避免控制器各自拼字符串；
 * - 只实现 USDT 本位、逐仓、单向持仓。
 */

export type SimSide = 'long' | 'short';
export type SimAction = 'open' | 'close';
export type SimOrderType = 'market' | 'limit';
export type SimOrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type SimLiquidity = 'maker' | 'taker';
export type SimOrderSource = 'user' | 'tp' | 'sl' | 'liquidation';
export type SimLedgerType =
  | 'deposit'
  | 'open_fee'
  | 'close_fee'
  | 'realized_pnl'
  | 'liquidation'
  | 'reset';

/** 一次行情快照，由 SimulationState 从 OKX 行情服务获取后传给引擎。 */
export interface MarketSnapshot {
  symbol: string;
  markPrice: number;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  ts: number;
}

/** 下单/试算入参。字符串来自前端，引擎内部会统一转 number。 */
export interface SimulationOrderInput {
  mode?: string;
  symbol: string;
  side: SimSide;
  action: SimAction;
  orderType: SimOrderType;
  qty: string | number;
  leverage?: number;
  price?: string | number | null;
  takeProfitPrice?: string | number | null;
  stopLossPrice?: string | number | null;
  reduceOnly?: boolean;
}

export interface SimPosition {
  id: string;
  symbol: string;
  side: SimSide;
  leverage: number;
  qty: number;
  entryPrice: number;
  /** 当前剩余仓位占用的逐仓保证金。 */
  margin: number;
  /** 该仓位累计已实现盈亏（已扣手续费，仅用于展示）。 */
  realizedPnl: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: 'open' | 'closed' | 'liquidated';
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface SimOrder {
  orderId: string;
  symbol: string;
  side: SimSide;
  action: SimAction;
  orderType: SimOrderType;
  leverage: number;
  qty: number;
  price: number | null;
  status: SimOrderStatus;
  filledQty: number;
  avgFillPrice: number | null;
  fee: number;
  /** 限价开仓单冻结的保证金 + 预估手续费；成交/撤销后归零。 */
  reservedMargin: number;
  reduceOnly: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  source: SimOrderSource;
  positionId?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
  filledAt?: string | null;
}

export interface SimLedgerEntry {
  id: string;
  type: SimLedgerType;
  /** 有符号金额：收入为正，支出为负。 */
  amount: number;
  balanceAfter: number;
  symbol?: string;
  orderId?: string;
  positionId?: string;
  remark?: string;
  createdAt: string;
}

export interface EquityPoint {
  ts: number;
  equity: number;
}

/** 落盘的完整账户状态。版本号用于后续迁移。 */
export interface SimAccountState {
  version: 2;
  walletBalance: number;
  /** 累计已实现盈亏（已扣手续费）。 */
  realizedPnl: number;
  /** 累计手续费。 */
  totalFee: number;
  positions: SimPosition[];
  orders: SimOrder[];
  ledger: SimLedgerEntry[];
  equityHistory: EquityPoint[];
  nextOrderId: number;
  nextPositionId: number;
  nextLedgerId: number;
  updatedAt: string;
}

export interface AccountSnapshot {
  walletBalance: number;
  availableBalance: number;
  positionMargin: number;
  orderMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  equity: number;
  totalFee: number;
  updatedAt: string;
}

export interface PositionSnapshot {
  id: string;
  symbol: string;
  side: SimSide;
  leverage: number;
  qty: number;
  entryPrice: number;
  markPrice: number;
  lastPrice: number;
  notional: number;
  initialMargin: number;
  maintenanceMargin: number;
  liquidationPrice: number;
  isolatedMargin: number;
  unrealizedPnl: number;
  realizedPnl: number;
  /** 收益率，返回小数（0.153846 表示 15.38%）。 */
  roe: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSnapshot {
  orderId: string;
  symbol: string;
  side: SimSide;
  action: SimAction;
  orderType: SimOrderType;
  leverage: number;
  qty: number;
  price: number | null;
  avgFillPrice: number | null;
  filledQty: number;
  notional: number;
  fee: number;
  status: SimOrderStatus;
  reduceOnly: boolean;
  source: SimOrderSource;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
  filledAt?: string | null;
}

export interface PreviewResult {
  symbol: string;
  side: SimSide;
  action: SimAction;
  orderType: SimOrderType;
  leverage: number;
  qty: number;
  markPrice: number;
  price: number;
  notional: number;
  margin: number;
  fee: number;
  liquidationPrice: number;
  maxQty: number;
  availableBalance: number;
}

export interface PlaceOrderResult {
  order: SimOrder;
  position?: SimPosition;
}

export interface ProcessResult {
  changed: boolean;
  events: string[];
}

export interface EngineConfig {
  initialWallet: number;
  takerFeeRate: number;
  makerFeeRate: number;
  maintenanceMarginRate: number;
  /** 市价单额外滑点（在买一/卖一基础上再让价）。 */
  slippageRate: number;
  maxLeverage: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  initialWallet: 100000,
  takerFeeRate: 0.0005,
  makerFeeRate: 0.0002,
  maintenanceMarginRate: 0.005,
  slippageRate: 0.0002,
  maxLeverage: 50,
};

/** 业务错误码，与《前后端接口设计》中的错误码保持一致。 */
export const SIM_ERROR = {
  BAD_REQUEST: 4001,
  INSUFFICIENT_BALANCE: 4101,
  LEVERAGE_LIMIT: 4102,
  INVALID_QTY: 4103,
  ORDER_NOT_FOUND: 4104,
  POSITION_NOT_FOUND: 4105,
  RISK_REJECTED: 4106,
  MARKET_UNAVAILABLE: 5001,
} as const;

export class SimulationError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'SimulationError';
  }
}
