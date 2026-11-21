import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import { marketApi } from '../api/services';
import type { DepthLevel, KlineItem, MarketSymbol, RecentTradeItem, TickerItem } from '../api/types';
import { getServerBaseUrl } from '../config/api';

function normalizeDepth(levels: [string, string][], reverse = false): DepthLevel[] {
  const source = reverse ? [...levels].reverse() : levels;
  let runningTotal = 0;
  return source.map(([price, qty]) => {
    runningTotal += Number(qty);
    return { price, qty, total: runningTotal.toFixed(3) };
  });
}

const WS_EXCHANGES = ['okx', 'binance'];

// 记住上次选择的交易所，刷新页面后仍停留在同一家，避免 Coinbase/Binance 被重置回 OKX
const EXCHANGE_STORAGE_KEY = 'market.exchange';
type ExchangeId = 'okx' | 'binance' | 'coinbase' | 'uniswap';

function loadSavedExchange(): ExchangeId {
  try {
    const saved = localStorage.getItem(EXCHANGE_STORAGE_KEY);
    if (saved === 'okx' || saved === 'binance' || saved === 'coinbase' || saved === 'uniswap') {
      return saved;
    }
  } catch {
    // localStorage 不可用时保持默认值
  }
  return 'okx';
}

// 图表一次加载的历史 K 线根数；200 根太少，向左拖动很快就看不到更早的行情。
const KLINE_LIMIT = 1000;
// 前端最多保留的 K 线数量，防止长时间运行后数组无限增长。
const KLINE_MAX_CANDLES = 2000;

export const useMarketStore = defineStore('market', () => {
  const exchange = ref<ExchangeId>(loadSavedExchange());
  const symbols = ref<MarketSymbol[]>([]);
  const tickers = ref<TickerItem[]>([]);
  // 股票代币来自 OKX instCategory=3，和当前加密货币交易所分开保存。
  const stockSymbols = ref<MarketSymbol[]>([]);
  const stockTickers = ref<TickerItem[]>([]);
  const stockLoading = ref(false);
  const depthBids = ref<DepthLevel[]>([]);
  const depthAsks = ref<DepthLevel[]>([]);
  const klines = ref<KlineItem[]>([]);
  const recentTrades = ref<RecentTradeItem[]>([]);
  const loading = ref(false);
  const depthLoading = ref(false);
  const chartLoading = ref(false);
  const tradesLoading = ref(false);
  const error = ref('');

  const tickerMap = computed(() =>
    Object.fromEntries(tickers.value.map((ticker) => [ticker.symbol, ticker])),
  );

  let socket: Socket | null = null;
  let currentWsSymbol = '';
  let currentWsInterval = '';
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let klinePollTimer: ReturnType<typeof setInterval> | null = null;
  let globalTickerTimer: ReturnType<typeof setInterval> | null = null;
  // 1 秒周期等高频刷新下请求可能并发返回，用序号丢弃过期响应
  let klineRequestSeq = 0;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (klinePollTimer) {
      clearInterval(klinePollTimer);
      klinePollTimer = null;
    }
  }

  function startPolling(sym: string, interval: string) {
    stopPolling();
    pollTimer = setInterval(() => {
      fetchTickers([sym]);
      fetchDepth(sym);
      fetchRecentTrades(sym);
    }, 3000);
  }

  function startKlinePolling(sym: string, interval: string) {
    if (klinePollTimer) clearInterval(klinePollTimer);
    const liveIntervals = ['1s', '30s', '1m', '5m'];
    if (!liveIntervals.includes(interval)) return;
    const ms = interval === '1s' ? 1000 : interval === '30s' ? 15000 : 30000;
    klinePollTimer = setInterval(() => {
      fetchKlines(sym, interval);
    }, ms);
  }

  function canUseWs(): boolean {
    return WS_EXCHANGES.includes(exchange.value);
  }

  function connectWs(sym: string, interval: string) {
    disconnectWs();
    currentWsSymbol = sym;
    currentWsInterval = interval;

    if (!canUseWs()) {
      fetchKlines(sym, interval);
      fetchDepth(sym);
      fetchRecentTrades(sym);
      startPolling(sym, interval);
      startKlinePolling(sym, interval);
      return;
    }

    socket = io(`${getServerBaseUrl()}/market`, {
      transports: ['websocket'],
      reconnection: true,
      // 有限重连 + 退避，避免后端不可达时无限重连；行情另有 3s REST 轮询兜底
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.3,
      timeout: 10000,
      auth: { token: localStorage.getItem('accessToken') || '' },
    });

    socket.on('connect', () => {
      if (socket) socket.auth = { token: localStorage.getItem('accessToken') || '' };
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      doSubscribe();
    });

    socket.on('connect_error', () => {});

    socket.on('tickers', (msg: { data: TickerItem }) => {
      if (msg.data) {
        const nextTickerMap = new Map(tickers.value.map((t) => [t.symbol, t]));
        nextTickerMap.set(msg.data.symbol, msg.data);
        tickers.value = Array.from(nextTickerMap.values());
      }
    });

    socket.on('books', (msg: { data: { symbol: string; bids: [string, string][]; asks: [string, string][] } }) => {
      if (msg.data?.bids && msg.data?.asks) {
        depthBids.value = normalizeDepth(msg.data.bids);
        depthAsks.value = normalizeDepth(msg.data.asks, true);
        depthLoading.value = false;
      }
    });

    socket.on('kline', (msg: { data: KlineItem }) => {
      if (msg.data) {
        // klines 统一保持「由新到旧」：新 K 线插到最前面，旧 K 线补到末尾。
        const list = klines.value;
        const idx = list.findIndex((k) => k.openTime === msg.data.openTime);
        if (idx >= 0) {
          list[idx] = msg.data;
        } else if (!list.length || msg.data.openTime > list[0].openTime) {
          list.unshift(msg.data);
        } else {
          list.push(msg.data);
        }
        if (list.length > KLINE_MAX_CANDLES) list.splice(KLINE_MAX_CANDLES);
        klines.value = [...list];
      }
    });

    socket.on('trades', (msg: { data: RecentTradeItem[] | RecentTradeItem }) => {
      const items = Array.isArray(msg.data) ? msg.data : [msg.data];
      if (items.length) {
        recentTrades.value = [...items.slice(0, 50), ...recentTrades.value].slice(0, 50);
      }
    });

    socket.on('disconnect', () => {});

    startKlinePolling(sym, interval);
  }

  function doSubscribe() {
    if (!socket?.connected) return;
    socket.emit('subscribe', { exchange: exchange.value, channel: 'tickers', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'books', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'kline', symbol: currentWsSymbol, interval: currentWsInterval });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'trades', symbol: currentWsSymbol });
  }

  function disconnectWs() {
    stopPolling();
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (!socket) return;
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'tickers', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'books', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'kline', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'trades', symbol: currentWsSymbol });
    socket.disconnect();
    socket = null;
  }

  function startGlobalTickerPoll() {
    stopGlobalTickerPoll();
    fetchTickers();
    globalTickerTimer = setInterval(() => {
      fetchTickers();
    }, 3000);
  }

  function stopGlobalTickerPoll() {
    if (globalTickerTimer) {
      clearInterval(globalTickerTimer);
      globalTickerTimer = null;
    }
  }

  // 创建 store 时自动启动全局行情轮询
  startGlobalTickerPoll();

  function setExchange(exch: ExchangeId) {
    if (exchange.value === exch) return;
    exchange.value = exch;
    try {
      localStorage.setItem(EXCHANGE_STORAGE_KEY, exch);
    } catch {
      // localStorage 不可用时忽略
    }
    // 切换交易所时先清空上一家的数据，避免短暂把 Binance 的币种显示在 Coinbase 页面。
    symbols.value = [];
    tickers.value = [];
    klines.value = [];
    depthBids.value = [];
    depthAsks.value = [];
    recentTrades.value = [];
  }

  async function fetchSymbols(params?: { keyword?: string; category?: string }) {
    loading.value = true;
    error.value = '';
    try {
      const data = await marketApi.getSymbols({ ...params, exchange: exchange.value });
      symbols.value = data.list;
      return symbols.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取品种失败';
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchTickers(symbolList?: string[]) {
    loading.value = true;
    error.value = '';
    try {
      const data = await marketApi.getTickers(symbolList, exchange.value);
      if (symbolList?.length) {
        const nextTickerMap = new Map(tickers.value.map((ticker) => [ticker.symbol, ticker]));
        data.list.forEach((ticker) => {
          nextTickerMap.set(ticker.symbol, ticker);
        });
        tickers.value = Array.from(nextTickerMap.values());
      } else {
        tickers.value = data.list;
      }
      return tickers.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取行情失败';
      return [];
    } finally {
      loading.value = false;
    }
  }

  // 拉取 OKX 股票代币（与当前加密货币交易所切换互不影响）
  async function fetchStockMarkets() {
    stockLoading.value = true;
    try {
      const [symbolData, tickerData] = await Promise.all([
        marketApi.getSymbols({ exchange: 'okx' }),
        marketApi.getTickers(undefined, 'okx'),
      ]);
      stockSymbols.value = symbolData.list.filter((item) => item.assetClass === 'stock');
      stockTickers.value = tickerData.list.filter((item) => item.assetClass === 'stock');
      return stockTickers.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取股票代币失败';
      stockSymbols.value = [];
      stockTickers.value = [];
      return [];
    } finally {
      stockLoading.value = false;
    }
  }

  async function fetchDepth(symbol: string) {
    depthLoading.value = true;
    error.value = '';
    try {
      const data = await marketApi.getDepth(symbol, exchange.value);
      depthBids.value = normalizeDepth(data.bids);
      depthAsks.value = normalizeDepth(data.asks, true);
      return { bids: depthBids.value, asks: depthAsks.value };
    } catch (err) {
      error.value = (err as Error)?.message || '获取盘口失败';
      depthBids.value = [];
      depthAsks.value = [];
      return { bids: depthBids.value, asks: depthAsks.value };
    } finally {
      depthLoading.value = false;
    }
  }

  async function fetchKlines(symbol: string, interval = '5m') {
    const seq = ++klineRequestSeq;
    chartLoading.value = true;
    error.value = '';
    try {
      const data = await marketApi.getKlines(symbol, interval, exchange.value, KLINE_LIMIT);
      // 快速切换周期/品种时，旧请求可能后返回，不能覆盖新数据
      if (seq !== klineRequestSeq) return klines.value;
      klines.value = data.list;
      return klines.value;
    } catch (err) {
      if (seq !== klineRequestSeq) return klines.value;
      error.value = (err as Error)?.message || '获取K线失败';
      klines.value = [];
      return [];
    } finally {
      if (seq === klineRequestSeq) chartLoading.value = false;
    }
  }

  async function fetchRecentTrades(symbol: string) {
    tradesLoading.value = true;
    error.value = '';
    try {
      const data = await marketApi.getTrades(symbol, exchange.value);
      recentTrades.value = data.list;
      return recentTrades.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取最近成交失败';
      recentTrades.value = [];
      return [];
    } finally {
      tradesLoading.value = false;
    }
  }

  return {
    exchange, symbols, tickers, stockSymbols, stockTickers, depthBids, depthAsks, klines, recentTrades,
    loading, stockLoading, depthLoading, chartLoading, tradesLoading, error, tickerMap,
    setExchange, connectWs, disconnectWs,
    startGlobalTickerPoll, stopGlobalTickerPoll,
    fetchSymbols, fetchTickers, fetchStockMarkets, fetchDepth, fetchKlines, fetchRecentTrades,
  };
});
