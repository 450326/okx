import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import { marketApi } from '../api/services';
import type { DepthLevel, KlineItem, MarketSymbol, RecentTradeItem, TickerItem } from '../api/types';

function normalizeDepth(levels: [string, string][], reverse = false): DepthLevel[] {
  const source = reverse ? [...levels].reverse() : levels;
  let runningTotal = 0;

  return source.map(([price, qty]) => {
    runningTotal += Number(qty);

    return {
      price,
      qty,
      total: runningTotal.toFixed(3),
    };
  });
}

export const useMarketStore = defineStore('market', () => {
  const exchange = ref<'okx' | 'binance' | 'uniswap'>('okx');
  const symbols = ref<MarketSymbol[]>([]);
  const tickers = ref<TickerItem[]>([]);
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

  function connectWs(sym: string, interval: string) {
    if (socket) disconnectWs();

    currentWsSymbol = sym;
    currentWsInterval = interval;

    socket = io('http://localhost:3000/market', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socket.on('connect', () => {
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
        const idx = klines.value.findIndex((k) => k.openTime === msg.data.openTime);
        if (idx >= 0) {
          klines.value[idx] = msg.data;
        } else {
          klines.value.push(msg.data);
          if (klines.value.length > 300) klines.value.shift();
        }
        klines.value = [...klines.value];
      }
    });

    socket.on('trades', (msg: { data: RecentTradeItem[] | RecentTradeItem }) => {
      const items = Array.isArray(msg.data) ? msg.data : [msg.data];
      if (items.length) {
        recentTrades.value = [...items.slice(0, 50), ...recentTrades.value].slice(0, 50);
      }
    });

    socket.on('disconnect', () => {});
  }

  function doSubscribe() {
    if (!socket?.connected) return;
    socket.emit('subscribe', { exchange: exchange.value, channel: 'tickers', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'books', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'kline', symbol: currentWsSymbol, interval: currentWsInterval });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'trades', symbol: currentWsSymbol });
  }

  function disconnectWs() {
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

  function setExchange(exch: 'okx' | 'binance' | 'uniswap') {
    exchange.value = exch;
  }

  async function fetchSymbols(params?: { keyword?: string; category?: string }) {
    loading.value = true;
    error.value = '';

    try {
      const data = await marketApi.getSymbols({ ...params, exchange: exchange.value });
      symbols.value = data.list;
      return symbols.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取品种失败';
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
      error.value = err instanceof Error ? err.message : '获取行情失败';
      return [];
    } finally {
      loading.value = false;
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
      error.value = err instanceof Error ? err.message : '获取盘口失败';
      depthBids.value = [];
      depthAsks.value = [];
      return { bids: depthBids.value, asks: depthAsks.value };
    } finally {
      depthLoading.value = false;
    }
  }

  async function fetchKlines(symbol: string, interval = '5m') {
    chartLoading.value = true;
    error.value = '';

    try {
      const data = await marketApi.getKlines(symbol, interval, exchange.value);
      klines.value = data.list;
      return klines.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取K线失败';
      klines.value = [];
      return [];
    } finally {
      chartLoading.value = false;
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
      error.value = err instanceof Error ? err.message : '获取最近成交失败';
      recentTrades.value = [];
      return [];
    } finally {
      tradesLoading.value = false;
    }
  }

  return {
    exchange,
    symbols,
    tickers,
    depthBids,
    depthAsks,
    klines,
    recentTrades,
    loading,
    depthLoading,
    chartLoading,
    tradesLoading,
    error,
    tickerMap,
    setExchange,
    connectWs,
    disconnectWs,
    fetchSymbols,
    fetchTickers,
    fetchDepth,
    fetchKlines,
    fetchRecentTrades,
  };
});
