/**
 * 模拟盘领域类型。
 *
 * 约定：
 * - 引擎内部全部使用 number，所有落盘/计算金额在写入前统一 round 到 8 位小数；
 * - 对外 API 的金额字符串由 SimulationState 负责格式化，避免控制器各自拼字符串；
 * - 只实现 USDT 本位、逐仓、单向持仓。
 */

import { ERROR_CODES } from '../../common/error-codes';

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
  | 'prediction_buy'
  | 'prediction_sell'
  | 'spot_buy'
  | 'spot_sell'
  | 'funding_fee'
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
  /** 实盘幂等键；模拟盘忽略。 */
  clientOrderId?: string;
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
  /** 该仓位累计资金费（正数为收取，负数为支付）。 */
  fundingFee?: number;
  /** 最近一次已结算资金费时间。 */
  lastFundingAt?: string | null;
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
  triggerPrice?: number | null;
  marginRatioAtTrigger?: number | null;
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

/* ==================== 预测市场模拟交易 ==================== */

export type SimPredictionOutcome = 'yes' | 'no';
export type SimPredictionAction = 'buy' | 'sell';

/** 预测份额持仓：完全用钱包现金买入，不占用保证金、不加杠杆。 */
export interface SimPredictionPosition {
  id: string;
  slug: string;
  marketId: string;
  question: string;
  eventTitle: string;
  icon: string;
  outcome: SimPredictionOutcome;
  outcomeName: string;
  tokenId: string;
  qty: number;
  /** 开仓均价，概率价格 0-1。 */
  entryPrice: number;
  status: 'open';
  openedAt: string;
  updatedAt: string;
}

/** 预测市场成交记录。 */
export interface SimPredictionOrder {
  orderId: string;
  slug: string;
  marketId: string;
  question: string;
  outcome: SimPredictionOutcome;
  outcomeName: string;
  action: SimPredictionAction;
  qty: number;
  price: number;
  notional: number;
  realizedPnl: number;
  status: 'filled';
  positionId: string;
  createdAt: string;
}

/** 预测市场行情快照，由 SimulationState 从 Polymarket 服务获取后传入引擎。 */
export interface PredictionMarketSnapshot {
  slug: string;
  marketId: string;
  question: string;
  eventTitle: string;
  icon: string;
  yesPrice: number;
  noPrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  yesName: string;
  noName: string;
  yesTokenId: string;
  noTokenId: string;
  closed: boolean;
  ts: number;
}

export interface PredictionOrderInput {
  mode?: string;
  slug: string;
  outcome: SimPredictionOutcome;
  action: SimPredictionAction;
  qty: string | number;
}

export interface PredictionPositionSnapshot {
  id: string;
  slug: string;
  marketId: string;
  question: string;
  eventTitle: string;
  icon: string;
  outcome: SimPredictionOutcome;
  outcomeName: string;
  qty: number;
  entryPrice: number;
  markPrice: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  /** 收益率，返回小数（0.15 表示 15%）。 */
  roe: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionOrderSnapshot {
  orderId: string;
  slug: string;
  marketId: string;
  question: string;
  outcome: SimPredictionOutcome;
  outcomeName: string;
  action: SimPredictionAction;
  qty: number;
  price: number;
  notional: number;
  realizedPnl: number;
  status: string;
  positionId: string;
  createdAt: string;
}

export interface PredictionPlaceResult {
  order: SimPredictionOrder;
  position?: SimPredictionPosition;
}

export interface EquityPoint {
  ts: number;
  equity: number;
}

/* ==================== 现货模拟交易 ==================== */

/** 现货持仓：买入后持有基础币，不占保证金、不加杠杆。 */
export interface SimSpotHolding {
  id: string;
  symbol: string;
  baseCoin: string;
  qty: number;
  /** 持仓成本价（含买入手续费摊薄）。 */
  avgCost: number;
  openedAt: string;
  updatedAt: string;
}

export type SimSpotSide = 'buy' | 'sell';

/** 现货成交记录。 */
export interface SimSpotOrder {
  orderId: string;
  symbol: string;
  baseCoin: string;
  side: SimSpotSide;
  qty: number;
  price: number;
  notional: number;
  fee: number;
  realizedPnl: number;
  status: 'filled';
  createdAt: string;
}

export interface SpotTradeInput {
  mode?: string;
  symbol: string;
  side: SimSpotSide;
  qty: string | number;
}

export interface SpotHoldingSnapshot {
  id: string;
  symbol: string;
  baseCoin: string;
  qty: number;
  avgCost: number;
  markPrice: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  roe: number;
  updatedAt: string;
}

export interface SpotOrderSnapshot extends SimSpotOrder {}

export interface SpotTradeResult {
  order: SimSpotOrder;
  holding?: SimSpotHolding;
}

/** 落盘的完整账户状态。版本号用于后续迁移。 */
export interface SimAccountState {
  version: 2;
  /** 账户创建时的初始资金，用于权益曲线和收益率基准。 */
  initialCapital: number;
  walletBalance: number;
  /** 累计已实现盈亏（合约 + 现货 + 预测，已扣手续费）。 */
  realizedPnl: number;
  /** 已实现盈亏分项：合约平仓/强平。 */
  contractRealizedPnl: number;
  /** 已实现盈亏分项：现货卖出。 */
  spotRealizedPnl: number;
  /** 已实现盈亏分项：预测卖出。 */
  predictionRealizedPnl: number;
  /** 累计手续费。 */
  totalFee: number;
  positions: SimPosition[];
  orders: SimOrder[];
  /** 现货持仓（与合约、预测持仓分开，共用同一个钱包余额）。 */
  spotHoldings: SimSpotHolding[];
  spotOrders: SimSpotOrder[];
  /** 预测市场持仓（与合约持仓分开，共用同一个钱包余额）。 */
  predictionPositions: SimPredictionPosition[];
  predictionOrders: SimPredictionOrder[];
  ledger: SimLedgerEntry[];
  equityHistory: EquityPoint[];
  nextOrderId: number;
  nextPositionId: number;
  nextSpotHoldingId: number;
  nextSpotOrderId: number;
  nextPredictionOrderId: number;
  nextPredictionPositionId: number;
  nextLedgerId: number;
  updatedAt: string;
}

export interface AccountSnapshot {
  walletBalance: number;
  availableBalance: number;
  positionMargin: number;
  orderMargin: number;
  /** 合约浮动盈亏（不含现货/预测）。 */
  contractPnl: number;
  /** 三种资产浮动盈亏之和，保留兼容字段。 */
  unrealizedPnl: number;
  /** 三种资产浮动盈亏之和。 */
  totalUnrealizedPnl: number;
  realizedPnl: number;
  contractRealizedPnl: number;
  spotRealizedPnl: number;
  predictionRealizedPnl: number;
  equity: number;
  totalFee: number;
  /** 现货持仓成本基数。 */
  spotCost: number;
  /** 现货持仓市值。 */
  spotValue: number;
  /** 现货持仓浮动盈亏。 */
  spotUnrealizedPnl: number;
  /** 预测持仓成本基数。 */
  predictionCost: number;
  /** 预测持仓按当前概率计算的市值。 */
  predictionValue: number;
  /** 预测持仓浮动盈亏。 */
  predictionUnrealizedPnl: number;
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
  /** 累计资金费（正数为收取，负数为支付）。 */
  fundingFee?: number;
  /** 最近一次已结算资金费时间。 */
  lastFundingAt?: string | null;
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
  initialWallet: 8000,
  takerFeeRate: 0.0005,
  makerFeeRate: 0.0002,
  maintenanceMarginRate: 0.005,
  slippageRate: 0.0002,
  maxLeverage: 50,
};

/** 业务错误码，与《前后端接口设计》中的错误码保持一致。 */
export const SIM_ERROR = {
  BAD_REQUEST: ERROR_CODES.BAD_REQUEST,
  INSUFFICIENT_BALANCE: ERROR_CODES.INSUFFICIENT_BALANCE,
  LEVERAGE_LIMIT: ERROR_CODES.LEVERAGE_LIMIT,
  INVALID_QTY: ERROR_CODES.INVALID_QTY,
  ORDER_NOT_FOUND: ERROR_CODES.ORDER_NOT_FOUND,
  POSITION_NOT_FOUND: ERROR_CODES.POSITION_NOT_FOUND,
  RISK_REJECTED: ERROR_CODES.RISK_REJECTED,
  INSTRUMENT_NOT_TRADABLE: ERROR_CODES.INSTRUMENT_NOT_TRADABLE,
  MIN_NOTIONAL: ERROR_CODES.MIN_NOTIONAL,
  INVALID_PRICE: ERROR_CODES.INVALID_PRICE,
  MODE_NOT_ALLOWED: ERROR_CODES.MODE_NOT_SUPPORTED,
  MARKET_UNAVAILABLE: ERROR_CODES.MARKET_UNAVAILABLE,
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
