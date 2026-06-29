import { del, get, post, put } from './http';
import type {
  AccountModeResponse,
  AssetSnapshot,
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

export const authApi = {
  login(email: string, password: string) {
    return post<LoginResponse, { email: string; password: string }>('/auth/login', { email, password });
  },
  me() {
    return get<UserProfile>('/auth/me');
  },
};

export const accountApi = {
  getMode() {
    return get<AccountModeResponse>('/account/mode');
  },
  updateMode(mode: TradeMode) {
    return put<AccountModeResponse, { mode: TradeMode }>('/account/mode', { mode });
  },
  getAssets(mode: TradeMode) {
    return get<AssetSnapshot>('/account/assets', { mode });
  },
  getLedger(mode: TradeMode) {
    return get<LedgerListResponse>('/account/ledger', { mode });
  },
  resetSimulation() {
    return post<{ reset: boolean; walletBalance: string }, { confirm: boolean }>('/account/simulation/reset', {
      confirm: true,
    });
  },
};

export const marketApi = {
  getSymbols(params?: { keyword?: string; category?: string; exchange?: string }) {
    return get<MarketSymbolsResponse>('/market/symbols', params);
  },
  getTickers(symbols?: string[], exchange?: string) {
    return get<TickerListResponse>('/market/tickers', {
      symbols: symbols?.length ? symbols.join(',') : undefined,
      exchange,
    });
  },
  getDepth(symbol: string, exchange?: string, limit = 20) {
    return get<DepthResponse>('/market/depth', { symbol, limit, exchange });
  },
  getKlines(symbol: string, interval = '5m', exchange?: string) {
    return get<KlineResponse>('/market/klines', { symbol, interval, exchange });
  },
  getTrades(symbol: string, exchange?: string) {
    return get<RecentTradeListResponse>('/market/trades', { symbol, exchange });
  },
};

export const positionApi = {
  getPositions(mode: TradeMode, symbol?: string) {
    return get<PositionListResponse>('/positions', { mode, symbol });
  },
};

export const orderApi = {
  preview(payload: OrderPreviewPayload) {
    return post<OrderPreviewResult, OrderPreviewPayload>('/orders/preview', payload);
  },
  create(payload: OrderPayload) {
    return post<{ orderId: string; status: string; payload: OrderPayload }, OrderPayload>('/orders', payload);
  },
  getOpen(mode: TradeMode, symbol?: string) {
    return get<OrderListResponse>('/orders/open', { mode, symbol });
  },
  getHistory(mode: TradeMode, symbol?: string) {
    return get<OrderListResponse>('/orders/history', { mode, symbol });
  },
};

export const exchangeApi = {
  getAccounts() {
    return get<ExchangeAccountListResponse>('/exchange-accounts');
  },
  createAccount(payload: ExchangeAccountPayload) {
    return post<ExchangeAccount, ExchangeAccountPayload>('/exchange-accounts', payload);
  },
  testAccount(id: string) {
    return post<{ id: string; connected: boolean }>(`/exchange-accounts/${id}/test`);
  },
  deleteAccount(id: string) {
    return del<{ id: string; deleted: boolean }>(`/exchange-accounts/${id}`);
  },
};
