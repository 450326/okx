// 交易模式：模拟盘 / 实盘
export type TradeMode = 'simulation' | 'live';

// 主题模式：深色 / 浅色
export type Theme = 'dark' | 'light';

// API 通用响应信封结构
export interface ApiEnvelope<T> {
  code: number;       // 业务状态码，0 表示成功
  message: string;    // 响应消息
  data: T;            // 业务数据本体
  requestId: string;  // 请求唯一标识
  ts: number;         // 服务器时间戳
}

// 用户档案信息
export interface UserProfile {
  id: string;          // 用户 ID
  email: string;       // 用户邮箱
  nickname: string;    // 用户昵称
  defaultMode: TradeMode;  // 默认交易模式
}

// 登录响应
export interface LoginResponse {
  accessToken: string;   // 访问令牌
  refreshToken: string;  // 刷新令牌
  user: UserProfile;     // 用户信息
}

// 账户模式响应
export interface AccountModeResponse {
  mode: TradeMode;  // 当前交易模式
}

// 资产快照
export interface AssetSnapshot {
  mode: TradeMode;          // 交易模式
  currency: string;         // 币种
  walletBalance: string;    // 钱包余额
  availableBalance: string; // 可用余额
  positionMargin: string;   // 持仓保证金
  orderMargin: string;      // 委托保证金
  unrealizedPnl: string;    // 未实现盈亏
  realizedPnl: string;      // 已实现盈亏
  equity: string;           // 账户权益
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
  list: LedgerItem[]; // 流水列表
}

// 市场交易对信息
export interface MarketSymbol {
  symbol: string;          // 交易对名称
  baseCoin?: string;       // 基础币种
  quoteCoin?: string;      // 计价币种
  maxLeverage: number;     // 最大杠杆
  minQty: string;          // 最小交易数量
  pricePrecision: number;  // 价格精度
  qtyPrecision: number;    // 数量精度
  question?: string;       // 预测市场问题（Polymarket）
  polymarketId?: string;   // Polymarket ID
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
  question?: string;            // 预测市场问题
  polymarketId?: string;        // Polymarket ID
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
  roe: string;                // 收益率
  takeProfitPrice?: string;   // 止盈价格
  stopLossPrice?: string;     // 止损价格
  status?: string;            // 持仓状态
}

// 持仓列表响应
export interface PositionListResponse {
  mode: TradeMode;      // 交易模式
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
}

// 下单请求参数（继承预览参数 + 保证金模式）
export interface OrderPayload extends OrderPreviewPayload {
  marginMode: 'isolated';  // 保证金模式（逐仓）
}

// 订单条目
export interface OrderItem {
  orderId: string;              // 订单 ID
  symbol: string;               // 交易对
  side?: 'long' | 'short';     // 方向
  action?: 'open' | 'close';   // 开平
  status: string;               // 订单状态
  orderType: string;            // 订单类型
  price?: string;               // 委托价格
  avgFillPrice?: string;        // 平均成交价
  qty: string;                  // 委托数量
  fee?: string;                 // 手续费
}

// 订单列表响应
export interface OrderListResponse {
  mode: TradeMode;    // 交易模式
  list: OrderItem[];  // 订单列表
}

// 交易所账户信息
export interface ExchangeAccount {
  id: string;            // 账户 ID
  exchange: string;      // 交易所名称
  label: string;         // 账户标签
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
