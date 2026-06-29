// 导入 Vue 响应式 API
import { computed, ref } from 'vue';
// 导入 Pinia 状态管理
import { defineStore } from 'pinia';
// 导入 Socket.IO 客户端
import { io, type Socket } from 'socket.io-client';
// 导入行情 API
import { marketApi } from '../api/services';
// 导入行情相关类型
import type { DepthLevel, KlineItem, MarketSymbol, RecentTradeItem, TickerItem } from '../api/types';

// 归一化盘口深度数据：累积总量并格式化
function normalizeDepth(levels: [string, string][], reverse = false): DepthLevel[] {
  // 若 reverse 为 true 则反转数组（卖单从低到高）
  const source = reverse ? [...levels].reverse() : levels;
  // 累计总数
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

// 行情状态 store
export const useMarketStore = defineStore('market', () => {
  // 当前交易所
  const exchange = ref<'okx' | 'binance' | 'uniswap' | 'polymarket'>('okx');
  // 交易品种列表
  const symbols = ref<MarketSymbol[]>([]);
  // Ticker 行情列表
  const tickers = ref<TickerItem[]>([]);
  // 买单盘口深度
  const depthBids = ref<DepthLevel[]>([]);
  // 卖单盘口深度
  const depthAsks = ref<DepthLevel[]>([]);
  // K 线数据
  const klines = ref<KlineItem[]>([]);
  // 最近成交记录
  const recentTrades = ref<RecentTradeItem[]>([]);
  // 通用加载状态
  const loading = ref(false);
  // 盘口加载状态
  const depthLoading = ref(false);
  // 图表加载状态
  const chartLoading = ref(false);
  // 成交记录加载状态
  const tradesLoading = ref(false);
  // 错误信息
  const error = ref('');

  // Ticker 映射表：以 symbol 为 key 快速查找
  const tickerMap = computed(() =>
    Object.fromEntries(tickers.value.map((ticker) => [ticker.symbol, ticker])),
  );

  // WebSocket 连接实例
  let socket: Socket | null = null;
  // 当前订阅的交易对
  let currentWsSymbol = '';
  // 当前订阅的 K 线周期
  let currentWsInterval = '';
  // 重连定时器
  let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // 连接 WebSocket 并订阅行情数据
  function connectWs(sym: string, interval: string) {
    // 断开已有连接
    if (socket) disconnectWs();

    currentWsSymbol = sym;
    currentWsInterval = interval;

    // 建立 WebSocket 连接
    socket = io('http://localhost:3000/market', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    // 连接成功：清除重连定时器并执行订阅
    socket.on('connect', () => {
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      doSubscribe();
    });

    // 连接错误处理
    socket.on('connect_error', () => {});

    // 接收 Ticker 推送
    socket.on('tickers', (msg: { data: TickerItem }) => {
      if (msg.data) {
        const nextTickerMap = new Map(tickers.value.map((t) => [t.symbol, t]));
        nextTickerMap.set(msg.data.symbol, msg.data);
        tickers.value = Array.from(nextTickerMap.values());
      }
    });

    // 接收盘口深度推送
    socket.on('books', (msg: { data: { symbol: string; bids: [string, string][]; asks: [string, string][] } }) => {
      if (msg.data?.bids && msg.data?.asks) {
        depthBids.value = normalizeDepth(msg.data.bids);
        depthAsks.value = normalizeDepth(msg.data.asks, true);
        depthLoading.value = false;
      }
    });

    // 接收 K 线推送
    socket.on('kline', (msg: { data: KlineItem }) => {
      if (msg.data) {
        const idx = klines.value.findIndex((k) => k.openTime === msg.data.openTime);
        if (idx >= 0) {
          // 更新已有 K 线
          klines.value[idx] = msg.data;
        } else {
          // 新增 K 线并限制数量不超过 300
          klines.value.push(msg.data);
          if (klines.value.length > 300) klines.value.shift();
        }
        klines.value = [...klines.value];
      }
    });

    // 接收最近成交推送
    socket.on('trades', (msg: { data: RecentTradeItem[] | RecentTradeItem }) => {
      const items = Array.isArray(msg.data) ? msg.data : [msg.data];
      if (items.length) {
        recentTrades.value = [...items.slice(0, 50), ...recentTrades.value].slice(0, 50);
      }
    });

    // 断开连接处理
    socket.on('disconnect', () => {});
  }

  // 执行 WebSocket 订阅（推送当前交易所及交易对）
  function doSubscribe() {
    if (!socket?.connected) return;
    socket.emit('subscribe', { exchange: exchange.value, channel: 'tickers', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'books', symbol: currentWsSymbol });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'kline', symbol: currentWsSymbol, interval: currentWsInterval });
    socket.emit('subscribe', { exchange: exchange.value, channel: 'trades', symbol: currentWsSymbol });
  }

  // 断开 WebSocket 连接并取消所有订阅
  function disconnectWs() {
    // 清除重连定时器
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (!socket) return;

    // 取消各频道订阅
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'tickers', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'books', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'kline', symbol: currentWsSymbol });
    socket.emit('unsubscribe', { exchange: exchange.value, channel: 'trades', symbol: currentWsSymbol });
    // 断开连接
    socket.disconnect();
    socket = null;
  }

  // 设置当前交易所
  function setExchange(exch: 'okx' | 'binance' | 'uniswap' | 'polymarket') {
    exchange.value = exch;
  }

  // 获取交易品种列表
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

  // 获取 Ticker 行情数据
  async function fetchTickers(symbolList?: string[]) {
    loading.value = true;
    error.value = '';

    try {
      const data = await marketApi.getTickers(symbolList, exchange.value);
      if (symbolList?.length) {
        // 增量更新：合并到现有 ticker 映射中
        const nextTickerMap = new Map(tickers.value.map((ticker) => [ticker.symbol, ticker]));
        data.list.forEach((ticker) => {
          nextTickerMap.set(ticker.symbol, ticker);
        });
        tickers.value = Array.from(nextTickerMap.values());
      } else {
        // 全量替换
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

  // 获取盘口深度数据
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

  // 获取 K 线数据
  async function fetchKlines(symbol: string, interval = '5m') {
    chartLoading.value = true;
    error.value = '';

    try {
      const data = await marketApi.getKlines(symbol, interval, exchange.value);
      klines.value = data.list;
      return klines.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取K线失败';
      klines.value = [];
      return [];
    } finally {
      chartLoading.value = false;
    }
  }

  // 获取最近成交记录
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

  // 导出 store 状态与方法
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
