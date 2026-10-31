import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { spotApi } from '../api/services';
import type {
  KlineItem,
  MarketSymbol,
  SpotHoldingRecord,
  SpotOrderPayload,
  SpotOrderRecord,
  TickerItem,
  TradeMode,
} from '../api/types';

type SpotExchange = 'okx' | 'binance' | 'coinbase';

export const useSpotStore = defineStore('spot', () => {
  const exchange = ref<SpotExchange>('okx');
  const symbols = ref<MarketSymbol[]>([]);
  const tickers = ref<TickerItem[]>([]);
  const klines = ref<KlineItem[]>([]);
  const holdings = ref<SpotHoldingRecord[]>([]);
  const orders = ref<SpotOrderRecord[]>([]);
  const loading = ref(false);
  const chartLoading = ref(false);
  const trading = ref(false);
  const error = ref('');

  const tickerMap = computed(() =>
    Object.fromEntries(tickers.value.map((ticker) => [ticker.symbol, ticker])),
  );

  let marketSeq = 0;
  let klineSeq = 0;

  async function fetchMarkets() {
    const seq = ++marketSeq;
    loading.value = true;
    error.value = '';
    try {
      const [symbolData, tickerData] = await Promise.all([
        spotApi.getMarkets(exchange.value),
        spotApi.getTickers(undefined, exchange.value),
      ]);
      if (seq !== marketSeq) return;
      symbols.value = symbolData.list;
      tickers.value = tickerData.list;
    } catch (err) {
      if (seq !== marketSeq) return;
      symbols.value = [];
      tickers.value = [];
      error.value = (err as Error)?.message || '获取现货行情失败';
    } finally {
      if (seq === marketSeq) loading.value = false;
    }
  }

  async function refreshTickers() {
    try {
      const data = await spotApi.getTickers(undefined, exchange.value);
      tickers.value = data.list;
    } catch {
      // 静默失败，保留上一次行情
    }
  }

  async function fetchKlines(symbol: string, interval = '5m') {    const seq = ++klineSeq;
    chartLoading.value = true;
    error.value = '';
    try {
      const data = await spotApi.getKlines(symbol, interval, exchange.value, 1000);
      if (seq !== klineSeq) return;
      klines.value = data.list;
    } catch (err) {
      if (seq !== klineSeq) return;
      klines.value = [];
      error.value = (err as Error)?.message || '获取现货 K 线失败';
    } finally {
      if (seq === klineSeq) chartLoading.value = false;
    }
  }

  async function fetchHoldings(mode: TradeMode = 'simulation') {
    try {
      const data = await spotApi.getHoldings();
      holdings.value = data.list;
      return holdings.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取现货持仓失败';
      holdings.value = [];
      return [];
    }
  }

  async function fetchOrders(symbol?: string) {
    try {
      const data = await spotApi.getOrders(symbol);
      orders.value = data.list;
      return orders.value;
    } catch (err) {
      error.value = (err as Error)?.message || '获取现货成交失败';
      orders.value = [];
      return [];
    }
  }

  async function placeOrder(payload: SpotOrderPayload) {
    trading.value = true;
    error.value = '';
    try {
      const result = await spotApi.placeOrder(payload);
      await Promise.all([fetchHoldings(), fetchOrders(payload.symbol)]);
      return result;
    } catch (err) {
      error.value = (err as Error)?.message || '现货下单失败';
      return null;
    } finally {
      trading.value = false;
    }
  }

  function setExchange(next: SpotExchange) {
    if (exchange.value === next) return;
    exchange.value = next;
    symbols.value = [];
    tickers.value = [];
    klines.value = [];
    holdings.value = [];
    orders.value = [];
  }

  return {
    exchange,
    symbols,
    tickers,
    klines,
    holdings,
    orders,
    loading,
    chartLoading,
    trading,
    error,
    tickerMap,
    fetchMarkets,
    refreshTickers,
    fetchKlines,
    fetchHoldings,
    fetchOrders,
    placeOrder,
    setExchange,
  };
});
