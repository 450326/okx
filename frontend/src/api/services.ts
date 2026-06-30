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
  OrderListResponse,
  OrderPayload,
  OrderPreviewPayload,
  OrderPreviewResult,
  PositionListResponse,
  TickerListResponse,
  TradeMode,
  UserProfile,
  DepthResponse,
  KlineResponse,
  RecentTradeListResponse,
  LoginResponse,
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
  // 更新交易模式
  updateMode(mode: TradeMode) {
    return put<AccountModeResponse, { mode: TradeMode }>('/account/mode', { mode });
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
  // 获取 K 线数据
  getKlines(symbol: string, interval = '5m', exchange?: string) {
    return get<KlineResponse>('/market/klines', { symbol, interval, exchange });
  },
  // 获取近期成交
  getTrades(symbol: string, exchange?: string) {
    return get<RecentTradeListResponse>('/market/trades', { symbol, exchange });
  },
};

// 持仓相关 API
export const positionApi = {
  // 获取持仓列表
  getPositions(mode: TradeMode, symbol?: string) {
    return get<PositionListResponse>('/positions', { mode, symbol });
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
