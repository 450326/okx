// 引入封装的 HTTP 请求函数
import { del, get, post, put } from './http';
// 引入 API 响应类型定义
import type {
  AccountModeResponse,
  AssetSnapshot,
  EquityHistoryResponse,
  LedgerListResponse,
  MarketSymbolsResponse,
  ExchangeAccount,
  ExchangeAccountListResponse,
  ExchangeAccountPayload,
  OrderItem,
  OrderListResponse,
  OrderPayload,
  OrderPreviewPayload,
  OrderPreviewResult,
  PositionListResponse,
  TickerListResponse,
  TradeMode,
  TradingState,
  UserProfile,
  DepthResponse,
  KlineResponse,
  RecentTradeListResponse,
  LoginResponse,
  PredictionHistoryInterval,
  PredictionHistoryResponse,
  PredictionMarketDetailResponse,
  PredictionMarketListResponse,
  PredictionOrderBookResponse,
  PredictionOrderListResponse,
  PredictionOrderPayload,
  PredictionOrderResult,
  PredictionPositionListResponse,
  PredictionSort,
  PredictionTradeListResponse,
  SpotHoldingListResponse,
  SpotOrderListResponse,
  SpotOrderPayload,
  SpotOrderResult,
} from './types';

// 认证相关 API
export const authApi = {
  // 用户登录
  login(email: string, password: string) {
    return post<LoginResponse, { email: string; password: string }>('/auth/login', { email, password });
  },
  // 获取当前用户信息
  me() {
    return get<UserProfile>('/auth/me');
  },
};

// 账户相关 API
export const accountApi = {
  // 获取当前交易模式
  getMode() {
    return get<AccountModeResponse>('/account/mode');
  },
  // 更新交易模式（mode 兼容 simulation/live，state 支持 live_readonly/live_trading）
  updateMode(mode: TradeMode | TradingState, reason?: string) {
    return put<AccountModeResponse, { mode: TradeMode | TradingState; reason?: string }>(
      '/account/mode',
      { mode, reason },
    );
  },
  // 获取资产信息
  getAssets(mode: TradeMode) {
    return get<AssetSnapshot>('/account/assets', { mode });
  },
  // 获取账本流水
  getEquityHistory(mode: TradeMode, range: string) {
    return get<EquityHistoryResponse>('/account/equity-history', { mode, range });
  },

  getLedger(mode: TradeMode) {
    return get<LedgerListResponse>('/account/ledger', { mode });
  },
  // 重置模拟盘数据
  resetSimulation() {
    return post<{ reset: boolean; walletBalance: string }, { confirm: boolean }>('/account/simulation/reset', {
      confirm: true,
    });
  },
};

// 行情相关 API
export const marketApi = {
  // 获取交易对列表
  getSymbols(params?: { keyword?: string; category?: string; exchange?: string }) {
    return get<MarketSymbolsResponse>('/market/symbols', params);
  },
  // 获取 Ticker 行情
  getTickers(symbols?: string[], exchange?: string) {
    return get<TickerListResponse>('/market/tickers', {
      symbols: symbols?.length ? symbols.join(',') : undefined,
      exchange,
    });
  },
  // 获取盘口深度
  getDepth(symbol: string, exchange?: string, limit = 20) {
    return get<DepthResponse>('/market/depth', { symbol, limit, exchange });
  },
  // 获取 K 线数据（默认 1000 根，避免图表向左拖动时没有历史）
  getKlines(symbol: string, interval = '5m', exchange?: string, limit = 1000) {
    return get<KlineResponse>('/market/klines', { symbol, interval, exchange, limit });
  },
  // 获取近期成交
  getTrades(symbol: string, exchange?: string) {
    return get<RecentTradeListResponse>('/market/trades', { symbol, exchange });
  },
};

// 预测市场（Polymarket）相关 API
export const predictionApi = {
  // 获取预测市场列表
  getMarkets(params: { limit?: number; offset?: number; sort?: PredictionSort; keyword?: string } = {}) {
    return get<PredictionMarketListResponse>('/prediction/markets', params);
  },
  // 获取单个市场详情（含相关市场）
  getMarket(slug: string) {
    return get<PredictionMarketDetailResponse>(`/prediction/markets/${encodeURIComponent(slug)}`);
  },
  // 获取 YES 概率走势
  getHistory(slug: string, interval: PredictionHistoryInterval = '1w') {
    return get<PredictionHistoryResponse>(`/prediction/markets/${encodeURIComponent(slug)}/history`, {
      interval,
    });
  },
  // 获取订单簿
  getOrderBook(slug: string, depth = 20) {
    return get<PredictionOrderBookResponse>(
      `/prediction/markets/${encodeURIComponent(slug)}/orderbook`,
      { depth },
    );
  },
  // 获取最近成交
  getTrades(slug: string, limit = 50) {
    return get<PredictionTradeListResponse>(
      `/prediction/markets/${encodeURIComponent(slug)}/trades`,
      { limit },
    );
  },
  // 获取预测持仓（与合约模拟盘共用资金）
  getPositions() {
    return get<PredictionPositionListResponse>('/prediction/positions');
  },
  // 获取预测成交记录
  getOrders(slug?: string) {
    return get<PredictionOrderListResponse>('/prediction/orders', { slug });
  },
  // 市价买入/卖出预测份额
  placeOrder(payload: PredictionOrderPayload) {
    return post<PredictionOrderResult, PredictionOrderPayload>('/prediction/orders', payload);
  },
  // 平仓（qty 不传表示全部卖出）
  closePosition(id: string, qty?: string) {
    return post<PredictionOrderResult, { qty?: string }>(
      `/prediction/positions/${encodeURIComponent(id)}/close`,
      { qty },
    );
  },
};

// 现货行情与模拟交易 API
export const spotApi = {
  getMarkets(exchange = 'okx') {
    return get<MarketSymbolsResponse>('/spot/markets', { exchange });
  },
  getTickers(symbols?: string[], exchange = 'okx') {
    return get<TickerListResponse>('/spot/tickers', {
      symbols: symbols?.length ? symbols.join(',') : undefined,
      exchange,
    });
  },
  getKlines(symbol: string, interval = '5m', exchange = 'okx', limit = 1000) {
    return get<KlineResponse>('/spot/klines', { symbol, interval, exchange, limit });
  },
  getHoldings() {
    return get<SpotHoldingListResponse>('/spot/holdings');
  },
  getOrders(symbol?: string) {
    return get<SpotOrderListResponse>('/spot/orders', { symbol });
  },
  placeOrder(payload: SpotOrderPayload) {
    return post<SpotOrderResult, SpotOrderPayload>('/spot/orders', payload);
  },
};

// 持仓相关 API
export const positionApi = {
  // 获取持仓列表
  getPositions(mode: TradeMode, symbol?: string) {
    return get<PositionListResponse>('/positions', { mode, symbol });
  },
  // 平仓（qty 不传表示全部平仓）
  closePosition(id: string, payload: { symbol?: string; qty?: string } = {}) {
    return post<{ orderId: string; status: string }, { symbol?: string; qty?: string }>(`/positions/${id}/close`, payload);
  },
  // 设置止盈止损
  updateRisk(id: string, payload: { takeProfitPrice?: string | null; stopLossPrice?: string | null }) {
    return put<{ id: string }, { takeProfitPrice?: string | null; stopLossPrice?: string | null }>(
      `/positions/${id}/risk`,
      payload,
    );
  },
};

// 订单相关 API
export const orderApi = {
  // 预览订单（计算保证金、手续费等）
  preview(payload: OrderPreviewPayload) {
    return post<OrderPreviewResult, OrderPreviewPayload>('/orders/preview', payload);
  },
  // 创建订单
  create(payload: OrderPayload) {
    return post<{ orderId: string; status: string; payload: OrderPayload }, OrderPayload>('/orders', payload);
  },
  // 获取当前委托
  getOpen(mode: TradeMode, symbol?: string) {
    return get<OrderListResponse>('/orders/open', { mode, symbol });
  },
  // 获取历史委托
  getHistory(mode: TradeMode, symbol?: string) {
    return get<OrderListResponse>('/orders/history', { mode, symbol });
  },
  // 撤销未成交委托
  cancel(orderId: string, mode: TradeMode) {
    return post<OrderItem, { mode: TradeMode }>(`/orders/${orderId}/cancel`, { mode });
  },
};

// 交易所账户相关 API
export const exchangeApi = {
  // 获取交易所账户列表
  getAccounts() {
    return get<ExchangeAccountListResponse>('/exchange-accounts');
  },
  // 创建交易所账户
  createAccount(payload: ExchangeAccountPayload) {
    return post<ExchangeAccount, ExchangeAccountPayload>('/exchange-accounts', payload);
  },
  // 测试交易所账户连接
  testAccount(id: string) {
    return post<{ id: string; connected: boolean }>(`/exchange-accounts/${id}/test`);
  },
  // 删除交易所账户
  deleteAccount(id: string) {
    return del<{ id: string; deleted: boolean }>(`/exchange-accounts/${id}`);
  },
};
