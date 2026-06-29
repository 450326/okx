export type TradeMode = 'simulation' | 'live';

export type Theme = 'dark' | 'light';

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  requestId: string;
  ts: number;
}

export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  defaultMode: TradeMode;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface AccountModeResponse {
  mode: TradeMode;
}

export interface AssetSnapshot {
  mode: TradeMode;
  currency: string;
  walletBalance: string;
  availableBalance: string;
  positionMargin: string;
  orderMargin: string;
  unrealizedPnl: string;
  realizedPnl: string;
  equity: string;
}

export interface LedgerItem {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  symbol: string;
  createdAt: string;
}

export interface LedgerListResponse {
  mode: TradeMode;
  list: LedgerItem[];
}

export interface MarketSymbol {
  symbol: string;
  baseCoin?: string;
  quoteCoin?: string;
  maxLeverage: number;
  minQty: string;
  pricePrecision: number;
  qtyPrecision: number;
}

export interface MarketSymbolsResponse {
  list: MarketSymbol[];
}

export interface TickerItem {
  symbol: string;
  lastPrice: string;
  markPrice: string;
  indexPrice: string;
  bidPrice: string;
  askPrice: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  priceChangePercent24h: string;
}

export interface TickerListResponse {
  list: TickerItem[];
}

export interface DepthLevel {
  price: string;
  qty: string;
  total: string;
}

export interface DepthResponse {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
}

export interface KlineItem {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface KlineResponse {
  symbol: string;
  interval: string;
  list: KlineItem[];
}

export interface RecentTradeItem {
  price: string;
  qty: string;
  side: 'buy' | 'sell';
  ts: number;
}

export interface RecentTradeListResponse {
  symbol: string;
  list: RecentTradeItem[];
}

export interface PositionItem {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  qty: string;
  entryPrice: string;
  markPrice: string;
  lastPrice?: string;
  notional?: string;
  initialMargin?: string;
  maintenanceMargin?: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  roe: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  status?: string;
}

export interface PositionListResponse {
  mode: TradeMode;
  list: PositionItem[];
}

export interface OrderPreviewPayload {
  mode: TradeMode;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  orderType: 'market' | 'limit';
  leverage: number;
  qty: string;
  price?: string | null;
  reduceOnly?: boolean;
  takeProfitPrice?: string;
  stopLossPrice?: string;
}

export interface OrderPreviewResult {
  symbol?: string;
  leverage?: number;
  qty?: string;
  estimatedNotional: string;
  estimatedMargin: string;
  estimatedFee: string;
  estimatedLiquidationPrice: string;
  maxQty: string;
}

export interface OrderPayload extends OrderPreviewPayload {
  marginMode: 'isolated';
}

export interface OrderItem {
  orderId: string;
  symbol: string;
  side?: 'long' | 'short';
  action?: 'open' | 'close';
  status: string;
  orderType: string;
  price?: string;
  avgFillPrice?: string;
  qty: string;
  fee?: string;
}

export interface OrderListResponse {
  mode: TradeMode;
  list: OrderItem[];
}

export interface ExchangeAccount {
  id: string;
  exchange: string;
  label: string;
  status: string;
  isTestnet: boolean;
  lastTestAt?: string;
  lastSyncAt?: string;
}

export interface ExchangeAccountListResponse {
  list: ExchangeAccount[];
}

export interface ExchangeAccountPayload {
  exchange: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  isTestnet: boolean;
}
