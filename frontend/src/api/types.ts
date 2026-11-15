// 交易模式：模拟盘 / 实盘
export type TradeMode = 'simulation' | 'live';

// 服务端交易状态机：模拟盘 → 实盘只读 → 实盘交易
export type TradingState = 'simulation' | 'live_readonly' | 'live_trading';

export interface ModeCapabilities {
  canUseSimulation: boolean;
  canReadLive: boolean;
  canTradeLive: boolean;
  canEnterLiveReadonly: boolean;
  canEnterLiveTrading: boolean;
}

export interface ModeTransition {
  from: TradingState;
  to: TradingState;
  at: string;
  reason: string;
  result: 'ok' | 'rejected';
}

export type CapabilityKey =
  | 'marketData'
  | 'futuresPositions'
  | 'futuresOpenOrders'
  | 'futuresOrderHistory'
  | 'futuresTrade'
  | 'spotHoldings'
  | 'spotTrade'
  | 'predictionPositions'
  | 'predictionTrade'
  | 'ledger'
  | 'equityHistory'
  | 'simulationReset';

export type CapabilitySource = 'public' | 'simulation' | 'okx' | 'none';

export interface CapabilityState {
  allowed: boolean;
  source: CapabilitySource;
  reason?: string;
  code?: number;
}

export interface CapabilityMatrix {
  state: TradingState;
  isSuper: boolean;
  overlayEnabled: boolean;
  capabilities: Record<CapabilityKey, CapabilityState>;
}

// 主题模式：深色 / 浅色
export type Theme = 'dark' | 'light';

// API 通用响应信封结构
export interface ApiEnvelope<T> {
  code: number;       // 业务状态码，0 表示成功
  message: string;    // 响应消息
  reason?: string;    // 机器可读原因
  suggestedAction?: string; // 建议操作
  data: T;            // 业务数据本体
  requestId: string;  // 请求唯一标识
  ts: number;         // 服务器时间戳
}

// 用户档案信息
// 两步验证挑战
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  user: UserProfile;
}

export type LoginResult = LoginResponse | TwoFactorChallenge;

export interface UserProfile {
  id: string;          // 用户 ID
  email: string;       // 用户邮箱
  nickname: string;    // 用户昵称
  isSuper?: boolean;   // 超级权限账号
  isGuest?: boolean;   // 游客账号
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  guestExpiresAt?: string | null;
  defaultMode: TradeMode;  // 默认交易模式
}

// 登录响应
export interface LoginResponse {
  accessToken: string;   // 访问令牌
  refreshToken: string;  // 刷新令牌
  expiresIn?: number;
  user: UserProfile;     // 用户信息
}

export interface EquityPoint {
  ts: number;
  equity: number;
}

export interface EquityHistoryResponse {
  mode: TradeMode;
  range: string;
  points: EquityPoint[];
}

// 账户模式响应
export interface AccountModeResponse {
  mode: TradeMode;  // 兼容字段：当前有效模式
  state: TradingState;
  isSuper: boolean;
  overlayEnabled: boolean;
  capabilities: ModeCapabilities;
  matrix: Record<CapabilityKey, CapabilityState>;
  blockers: string[];
  updatedAt: string;
  lastTransition: ModeTransition | null;
}

// 资产快照
export interface AssetSnapshot {
  mode: TradeMode;          // 交易模式
  source?: CapabilitySource; // simulation / okx
  currency: string;         // 币种
  walletBalance: string;    // 钱包余额
  availableBalance: string; // 可用余额
  positionMargin: string;   // 持仓保证金
  orderMargin: string;      // 委托保证金
  contractPnl?: string;     // 合约浮动盈亏
  unrealizedPnl: string;    // 总浮动盈亏（兼容字段）
  totalUnrealizedPnl?: string; // 总浮动盈亏
  realizedPnl: string;      // 总已实现盈亏
  contractRealizedPnl?: string;
  spotRealizedPnl?: string;
  predictionRealizedPnl?: string;
  equity: string;           // 账户权益
  spotCost?: string;        // 现货成本基数
  spotValue?: string;       // 现货持仓市值
  spotUnrealizedPnl?: string; // 现货浮动盈亏
  predictionCost?: string;  // 预测成本基数
  predictionValue?: string;        // 预测持仓市值
  predictionUnrealizedPnl?: string; // 预测持仓浮动盈亏
}

// 账本流水条目
export interface LedgerItem {
  id: string;           // 流水 ID
  type: string;         // 流水类型
  amount: string;       // 变动金额
  balanceAfter: string; // 变动后余额
  symbol: string;       // 关联交易对
  createdAt: string;    // 创建时间
}

// 账本流水列表响应
export interface LedgerListResponse {
  mode: TradeMode;    // 交易模式
  source?: CapabilitySource;
  list: LedgerItem[]; // 流水列表
}

export interface RiskEventItem {
  id: string;
  positionId: string;
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  triggerType: 'liquidation' | 'take_profit' | 'stop_loss';
  triggerPrice: number;
  executionPrice: number;
  marginRatio: number;
  qty: number;
  realizedPnl: number;
  ledgerId?: string | null;
  createdAt: string;
}

export interface RiskEventListResponse {
  list: RiskEventItem[];
}

// 市场交易对信息
export interface MarketSymbol {
  symbol: string;          // 交易对名称
  baseCoin?: string;       // 基础币种
  quoteCoin?: string;      // 计价币种
  maxLeverage: number;     // 最大杠杆
  minQty: string;          // 最小交易数量（基础币）
  minNotional?: string;    // 最小名义价值
  pricePrecision: number;  // 价格精度
  qtyPrecision: number;    // 数量精度
  assetClass?: 'crypto' | 'stock'; // 加密货币 / 股票代币
  leverageTiers?: Array<{ maxLeverage: number; maintenanceMarginRate?: number }>;
  maintenanceMarginRate?: number;
  tradable?: boolean;
  tradableModes?: Array<'simulation' | 'live'>;
  status?: string;
}

// 市场交易对列表响应
export interface MarketSymbolsResponse {
  list: MarketSymbol[];  // 交易对列表
}

// Ticker 行情项
export interface TickerItem {
  symbol: string;               // 交易对
  lastPrice: string;            // 最新价
  markPrice: string;            // 标记价格
  indexPrice: string;           // 指数价格
  bidPrice: string;             // 买一价
  askPrice: string;             // 卖一价
  high24h: string;              // 24 小时最高价
  low24h: string;               // 24 小时最低价
  volume24h: string;            // 24 小时成交量
  priceChangePercent24h: string; // 24 小时涨跌幅
  assetClass?: 'crypto' | 'stock'; // 加密货币 / 股票代币
}

// Ticker 行情列表响应
export interface TickerListResponse {
  list: TickerItem[];  // 行情列表
}

// 深度档位
export interface DepthLevel {
  price: string;  // 价格
  qty: string;    // 数量
  total: string;  // 累计数量
}

// 深度数据响应
export interface DepthResponse {
  symbol: string;           // 交易对
  bids: [string, string][]; // 买盘 [价格, 数量]
  asks: [string, string][]; // 卖盘 [价格, 数量]
}

// K 线数据项
export interface KlineItem {
  openTime: number;  // 开盘时间
  open: string;      // 开盘价
  high: string;      // 最高价
  low: string;       // 最低价
  close: string;     // 收盘价
  volume: string;    // 成交量
}

// K 线数据响应
export interface KlineResponse {
  symbol: string;    // 交易对
  interval: string;  // K 线周期
  list: KlineItem[]; // K 线列表
}

// K 线成交标记（B/S）
export interface KlineTradeMarker {
  time: number;             // 成交时间（毫秒）
  side: 'buy' | 'sell';     // 买/卖
  price: number;            // 成交价格
}

// 近期成交条目
export interface RecentTradeItem {
  price: string;      // 成交价格
  qty: string;        // 成交数量
  side: 'buy' | 'sell';  // 买卖方向
  ts: number;         // 成交时间戳
}

// 近期成交列表响应
export interface RecentTradeListResponse {
  symbol: string;        // 交易对
  list: RecentTradeItem[]; // 成交列表
}

// 持仓条目
export interface PositionItem {
  id: string;                 // 持仓 ID
  symbol: string;             // 交易对
  side: 'long' | 'short';    // 持仓方向
  leverage: number;           // 杠杆倍数
  qty: string;                // 持仓数量
  entryPrice: string;         // 开仓均价
  markPrice: string;          // 标记价格
  lastPrice?: string;         // 最新价
  notional?: string;          // 名义价值
  initialMargin?: string;     // 初始保证金
  maintenanceMargin?: string; // 维持保证金
  liquidationPrice: string;   // 强平价格
  unrealizedPnl: string;      // 未实现盈亏
  realizedPnl?: string;       // 该仓位已实现盈亏
  fundingFee?: string;        // 累计资金费
  roe: string;                // 收益率（小数，0.15 表示 15%）
  takeProfitPrice?: string;   // 止盈价格
  stopLossPrice?: string;     // 止损价格
  status?: string;            // 持仓状态
  createdAt?: string;         // 开仓时间
  updatedAt?: string;         // 更新时间
}

// 持仓列表响应
export interface PositionListResponse {
  mode: TradeMode;      // 交易模式
  source?: CapabilitySource;
  list: PositionItem[]; // 持仓列表
}

// 订单预览请求参数
export interface OrderPreviewPayload {
  mode: TradeMode;              // 交易模式
  symbol: string;               // 交易对
  side: 'long' | 'short';      // 方向
  action: 'open' | 'close';    // 开平
  orderType: 'market' | 'limit'; // 订单类型
  leverage: number;             // 杠杆倍数
  qty: string;                  // 委托数量
  price?: string | null;        // 委托价格（限价单）
  reduceOnly?: boolean;         // 仅减仓
  takeProfitPrice?: string;     // 止盈价格
  stopLossPrice?: string;       // 止损价格
}

// 订单预览结果
export interface OrderPreviewResult {
  symbol?: string;                 // 交易对
  leverage?: number;               // 杠杆倍数
  qty?: string;                    // 数量
  estimatedNotional: string;        // 预估名义价值
  estimatedMargin: string;          // 预估保证金
  estimatedFee: string;             // 预估手续费
  estimatedLiquidationPrice: string; // 预估强平价格
  maxQty: string;                   // 最大可开数量
  markPrice?: string;               // 试算使用的标记价格
  price?: string;                   // 试算使用的成交/委托价格
  availableBalance?: string;        // 试算时可用余额
}

// 下单请求参数（继承预览参数 + 保证金模式）
export interface OrderPayload extends OrderPreviewPayload {
  marginMode: 'isolated';  // 保证金模式（逐仓）
  clientOrderId?: string;  // 实盘幂等键
}

// 订单条目
export interface OrderItem {
  orderId: string;              // 订单 ID
  clientOrderId?: string;       // 实盘幂等键
  exchangeOrderId?: string | null;
  symbol: string;               // 交易对
  side?: 'long' | 'short';     // 方向
  action?: 'open' | 'close';   // 开平
  status: string;               // 订单状态
  orderType: string;            // 订单类型
  price?: string;               // 委托价格
  avgFillPrice?: string | null; // 平均成交价
  qty: string;                  // 委托数量
  filledQty?: string;           // 已成交数量
  notional?: string;            // 名义价值
  fee?: string;                 // 手续费
  reduceOnly?: boolean;         // 是否只减仓
  source?: string;              // user / tp / sl / liquidation
  rejectReason?: string;        // 拒单原因
  createdAt?: string;
  updatedAt?: string;
  filledAt?: string;
}

// 订单列表响应
export interface OrderListResponse {
  mode: TradeMode;    // 交易模式
  source?: CapabilitySource;
  list: OrderItem[];  // 订单列表
}

export interface LiveOrderStatusItem {
  orderId: string;
  clientOrderId: string;
  exchangeOrderId?: string | null;
  status: string;
  localStatus: string;
  exchangeStatus?: string | null;
  mismatch?: boolean;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  orderType: string;
  qty: string;
  price?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveOrderStatusResponse {
  mode: TradeMode;
  source: CapabilitySource;
  list: LiveOrderStatusItem[];
}

export type NotificationType =
  | 'risk_warning'
  | 'liquidation'
  | 'take_profit'
  | 'stop_loss'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message: string;
  symbol?: string;
  positionId?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  list: AppNotification[];
  unreadCount: number;
}

// 交易所账户信息
export interface ExchangeAccount {
  id: string;            // 账户 ID
  exchange: string;      // 交易所名称
  label: string;         // 账户标签
  apiKeyMasked?: string; // 脱敏 Key
  apiKeyFingerprint?: string; // 不可逆指纹
  permissions?: string[];
  status: string;        // 账户状态
  isTestnet: boolean;    // 是否测试网
  lastTestAt?: string;   // 最后测试时间
  lastSyncAt?: string;   // 最后同步时间
}

// 交易所账户列表响应
export interface ExchangeAccountListResponse {
  list: ExchangeAccount[];  // 账户列表
}

// 添加交易所账户请求参数
export interface ExchangeAccountPayload {
  exchange: string;   // 交易所名称
  label: string;      // 账户标签
  apiKey: string;     // API Key
  apiSecret: string;  // API Secret
  passphrase: string; // API Passphrase
  isTestnet: boolean; // 是否测试网
}

/* ==================== 现货交易 ==================== */

export interface SpotHoldingRecord {
  id: string;
  symbol: string;
  baseCoin: string;
  qty: string;
  avgCost: string;
  markPrice: string;
  costBasis: string;
  currentValue: string;
  unrealizedPnl: string;
  roe: string;
  updatedAt: string;
}

export interface SpotHoldingListResponse {
  mode: TradeMode;
  source?: CapabilitySource;
  overlay?: boolean;
  list: SpotHoldingRecord[];
}

export interface SpotOrderRecord {
  orderId: string;
  symbol: string;
  baseCoin: string;
  side: 'buy' | 'sell';
  qty: string;
  price: string;
  notional: string;
  fee: string;
  realizedPnl: string;
  status: string;
  createdAt: string;
}

export interface SpotOrderListResponse {
  mode: TradeMode;
  source?: CapabilitySource;
  overlay?: boolean;
  list: SpotOrderRecord[];
}

export interface SpotOrderPayload {
  mode?: TradeMode;
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
}

export interface SpotOrderResult {
  order: SpotOrderRecord;
  holding?: {
    id: string;
    symbol: string;
    baseCoin: string;
    qty: string;
    avgCost: string;
    openedAt: string;
    updatedAt: string;
  };
}

/* ==================== 预测市场（Polymarket） ==================== */

// 预测市场列表排序方式
export type PredictionSort = 'volume' | 'liquidity' | 'newest' | 'ending';

// 概率走势区间
export type PredictionHistoryInterval = '1d' | '1w' | '1m' | 'max';

// 二元结果
export interface PredictionOutcome {
  name: string;    // 结果名，通常是 Yes / No
  price: number;   // 概率价格（0-1）
  tokenId: string; // CLOB token id
}

// 预测市场
export interface PredictionMarket {
  id: string;
  slug: string;
  question: string;
  description: string;
  image: string;
  icon: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  outcomes: PredictionOutcome[];
  yesPrice: number;          // YES 概率（0-1）
  noPrice: number | null;    // NO 概率（0-1）
  change24h: number | null;  // 24h 概率变化，1 表示 100 个百分点
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  negRisk: boolean;
  resolutionSource: string;
}

// 预测市场列表响应
export interface PredictionMarketListResponse {
  list: PredictionMarket[];
  total: number | null;
  offset: number;
  limit: number;
  hasMore: boolean;
  upstream: boolean;
  message?: string;
}

// 相关市场摘要
export interface PredictionMarketSummary {
  id: string;
  slug: string;
  question: string;
  icon: string;
  yesPrice: number;
  volumeTotal: number;
  endDate: string | null;
}

// 市场详情响应
export interface PredictionMarketDetailResponse {
  market: PredictionMarket;
  related: PredictionMarketSummary[];
}

// 概率历史点
export interface PredictionHistoryPoint {
  t: number; // 秒级时间戳
  p: number; // 概率（0-1）
}

// 概率历史响应
export interface PredictionHistoryResponse {
  slug: string;
  tokenId: string;
  interval: string;
  fidelity: number;
  points: PredictionHistoryPoint[];
}

// 盘口档位
export interface PredictionBookLevel {
  price: number;
  size: number;
}

// 盘口响应
export interface PredictionOrderBookResponse {
  slug: string;
  tokenId: string;
  midpoint: number | null;
  spread: number | null;
  bids: PredictionBookLevel[];
  asks: PredictionBookLevel[];
}

// 成交记录
export interface PredictionTradeItem {
  id: string;
  side: 'buy' | 'sell';
  outcome: string;
  outcomeIndex: number;
  price: number;
  size: number;
  value: number;
  ts: number;
}

// 成交列表响应
export interface PredictionTradeListResponse {
  slug: string;
  list: PredictionTradeItem[];
}

/* ==================== 预测市场模拟交易 ==================== */

export type PredictionTradeAction = 'buy' | 'sell';

// 预测持仓
export interface PredictionPositionRecord {
  id: string;
  slug: string;
  marketId: string;
  question: string;
  eventTitle: string;
  icon: string;
  outcome: 'yes' | 'no';
  outcomeName: string;
  qty: string;
  entryPrice: string;
  markPrice: string;
  costBasis: string;
  currentValue: string;
  unrealizedPnl: string;
  roe: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// 预测持仓列表响应
export interface PredictionPositionListResponse {
  mode: TradeMode;
  source?: CapabilitySource;
  overlay?: boolean;
  list: PredictionPositionRecord[];
}

// 预测成交记录
export interface PredictionOrderRecord {
  orderId: string;
  slug: string;
  marketId: string;
  question: string;
  outcome: 'yes' | 'no';
  outcomeName: string;
  action: PredictionTradeAction;
  qty: string;
  price: string;
  notional: string;
  realizedPnl: string;
  status: string;
  positionId: string;
  createdAt: string;
}

// 预测成交列表响应
export interface PredictionOrderListResponse {
  mode: TradeMode;
  source?: CapabilitySource;
  overlay?: boolean;
  list: PredictionOrderRecord[];
}

// 预测下单参数
export interface PredictionOrderPayload {
  slug: string;
  outcome: 'yes' | 'no';
  action: PredictionTradeAction;
  qty: string;
}

// 预测下单结果
export interface PredictionOrderResult {
  orderId: string;
  status: string;
  price: string;
  qty: string;
  notional: string;
  realizedPnl: string;
  positionId?: string;
  order: PredictionOrderRecord;
}
