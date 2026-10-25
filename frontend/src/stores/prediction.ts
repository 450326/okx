import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { predictionApi } from '../api/services';
import { $t } from '../utils/i18n';
import type {
  PredictionHistoryInterval,
  PredictionHistoryPoint,
  PredictionMarket,
  PredictionMarketDetailResponse,
  PredictionOrderBookResponse,
  PredictionOrderPayload,
  PredictionOrderRecord,
  PredictionOrderResult,
  PredictionPositionRecord,
  PredictionSort,
  PredictionTradeItem,
} from '../api/types';

// 每页市场数量；Gamma 单次最多返回 100 条
const PAGE_SIZE = 24;

// 预测市场状态：列表筛选 + 详情页行情，全部走独立的 /prediction 接口
export const usePredictionStore = defineStore('prediction', () => {
  // ---------- 列表 ----------
  const markets = ref<PredictionMarket[]>([]);
  const total = ref<number | null>(null);
  const hasMore = ref(false);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref('');
  const upstream = ref(true);
  const keyword = ref('');
  const sort = ref<PredictionSort>('volume');
  const updatedAt = ref(0);

  // 用请求序号丢弃过期响应，避免快速切换排序/搜索时旧结果覆盖新结果
  let requestSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  // 单独记录上游分页偏移，避免前端去重后 offset 错位
  let listOffset = 0;

  // 当前页市场的汇总数据，用于顶部概览
  const totalVolume24h = computed(() =>
    markets.value.reduce((sum, market) => sum + market.volume24h, 0),
  );
  const totalLiquidity = computed(() =>
    markets.value.reduce((sum, market) => sum + market.liquidity, 0),
  );
  const activeCount = computed(() => markets.value.filter((market) => !market.closed).length);

  async function fetchMarkets(reset = true) {
    if (!reset && (loading.value || loadingMore.value)) return;

    const seq = ++requestSeq;
    if (reset) {
      loading.value = true;
    } else {
      loadingMore.value = true;
    }
    error.value = '';

    try {
      const requestOffset = reset ? 0 : listOffset;
      const data = await predictionApi.getMarkets({
        limit: PAGE_SIZE,
        offset: requestOffset,
        sort: sort.value,
        keyword: keyword.value.trim() || undefined,
      });
      if (seq !== requestSeq) return;

      if (reset) {
        markets.value = data.list;
      } else {
        // 搜索/分页期间上游排序可能变化，按 id 去重避免重复卡片
        const existing = new Set(markets.value.map((market) => market.id));
        const appended = data.list.filter((market) => !existing.has(market.id));
        markets.value = [...markets.value, ...appended];
      }
      listOffset = requestOffset + data.list.length;
      total.value = data.total;
      hasMore.value = data.hasMore;
      upstream.value = data.upstream;
      error.value = data.upstream ? '' : $t('prediction.upstreamError');
      updatedAt.value = Date.now();
    } catch (err) {
      if (seq !== requestSeq) return;
      error.value = (err as Error)?.message || $t('prediction.loadFailed');
      upstream.value = false;
      if (reset) {
        markets.value = [];
        total.value = null;
        hasMore.value = false;
        listOffset = 0;
      }
    } finally {
      if (seq === requestSeq) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value) return;
    await fetchMarkets(false);
  }

  function setSort(next: PredictionSort) {
    if (sort.value === next) return;
    sort.value = next;
    void fetchMarkets(true);
  }

  function setKeyword(next: string) {
    keyword.value = next;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void fetchMarkets(true);
    }, 350);
  }

  function refresh() {
    return fetchMarkets(true);
  }

  // ---------- 详情 ----------
  const detail = ref<PredictionMarketDetailResponse | null>(null);
  const detailLoading = ref(false);
  const detailError = ref('');
  const history = ref<PredictionHistoryPoint[]>([]);
  const historyInterval = ref<PredictionHistoryInterval>('1w');
  const historyLoading = ref(false);
  const orderBook = ref<PredictionOrderBookResponse | null>(null);
  const bookLoading = ref(false);
  const trades = ref<PredictionTradeItem[]>([]);
  const tradesLoading = ref(false);

  // ---------- 模拟交易 ----------
  const positions = ref<PredictionPositionRecord[]>([]);
  const positionsLoading = ref(false);
  const orders = ref<PredictionOrderRecord[]>([]);
  const ordersLoading = ref(false);
  const trading = ref(false);
  const tradeError = ref('');
  const lastTrade = ref<PredictionOrderResult | null>(null);

  // 详情页也会在快速切换市场时丢弃过期响应
  let detailSeq = 0;
  let historySeq = 0;
  let bookSeq = 0;
  let tradesSeq = 0;
  let positionsSeq = 0;
  let ordersSeq = 0;

  async function fetchDetail(slug: string) {
    const seq = ++detailSeq;
    detailLoading.value = true;
    detailError.value = '';
    try {
      const data = await predictionApi.getMarket(slug);
      if (seq !== detailSeq) return;
      detail.value = data;
    } catch (err) {
      if (seq !== detailSeq) return;
      detail.value = null;
      detailError.value = (err as Error)?.message || '预测市场不存在';
    } finally {
      if (seq === detailSeq) detailLoading.value = false;
    }
  }

  async function fetchHistory(slug: string, interval: PredictionHistoryInterval = historyInterval.value) {
    const seq = ++historySeq;
    historyInterval.value = interval;
    historyLoading.value = true;
    try {
      const data = await predictionApi.getHistory(slug, interval);
      if (seq !== historySeq) return;
      history.value = data.points;
    } catch {
      if (seq !== historySeq) return;
      history.value = [];
    } finally {
      if (seq === historySeq) historyLoading.value = false;
    }
  }

  async function fetchOrderBook(slug: string) {
    const seq = ++bookSeq;
    bookLoading.value = true;
    try {
      const data = await predictionApi.getOrderBook(slug);
      if (seq !== bookSeq) return;
      orderBook.value = data;
    } catch {
      if (seq !== bookSeq) return;
      orderBook.value = null;
    } finally {
      if (seq === bookSeq) bookLoading.value = false;
    }
  }

  async function fetchTrades(slug: string) {
    const seq = ++tradesSeq;
    tradesLoading.value = true;
    try {
      const data = await predictionApi.getTrades(slug);
      if (seq !== tradesSeq) return;
      trades.value = data.list;
    } catch {
      if (seq !== tradesSeq) return;
      trades.value = [];
    } finally {
      if (seq === tradesSeq) tradesLoading.value = false;
    }
  }

  // 切换详情页时清空上一张市场的数据，避免闪一下旧内容
  function clearDetail() {
    detailSeq += 1;
    historySeq += 1;
    bookSeq += 1;
    tradesSeq += 1;
    detail.value = null;
    detailError.value = '';
    history.value = [];
    orderBook.value = null;
    trades.value = [];
    historyInterval.value = '1w';
  }

  // ---------- 模拟交易动作 ----------

  async function fetchPositions() {
    const seq = ++positionsSeq;
    positionsLoading.value = true;
    try {
      const data = await predictionApi.getPositions();
      if (seq !== positionsSeq) return;
      positions.value = data.list;
    } catch {
      if (seq !== positionsSeq) return;
      positions.value = [];
    } finally {
      if (seq === positionsSeq) positionsLoading.value = false;
    }
  }

  async function fetchOrders(slug?: string) {
    const seq = ++ordersSeq;
    ordersLoading.value = true;
    try {
      const data = await predictionApi.getOrders(slug);
      if (seq !== ordersSeq) return;
      orders.value = data.list;
    } catch {
      if (seq !== ordersSeq) return;
      orders.value = [];
    } finally {
      if (seq === ordersSeq) ordersLoading.value = false;
    }
  }

  async function placeOrder(payload: PredictionOrderPayload): Promise<PredictionOrderResult> {
    trading.value = true;
    tradeError.value = '';
    try {
      const result = await predictionApi.placeOrder(payload);
      lastTrade.value = result;
      await Promise.all([fetchPositions(), fetchOrders(payload.slug)]);
      return result;
    } catch (err) {
      tradeError.value = (err as Error)?.message || $t('prediction.tradeFailed');
      throw err;
    } finally {
      trading.value = false;
    }
  }

  async function closePosition(id: string, qty?: string): Promise<PredictionOrderResult> {
    trading.value = true;
    tradeError.value = '';
    try {
      const result = await predictionApi.closePosition(id, qty);
      lastTrade.value = result;
      await fetchPositions();
      return result;
    } catch (err) {
      tradeError.value = (err as Error)?.message || $t('prediction.tradeFailed');
      throw err;
    } finally {
      trading.value = false;
    }
  }

  function clearTradeError() {
    tradeError.value = '';
    lastTrade.value = null;
  }

  return {
    // 列表
    markets,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    upstream,
    keyword,
    sort,
    updatedAt,
    totalVolume24h,
    totalLiquidity,
    activeCount,
    fetchMarkets,
    loadMore,
    setSort,
    setKeyword,
    refresh,
    // 详情
    detail,
    detailLoading,
    detailError,
    history,
    historyInterval,
    historyLoading,
    orderBook,
    bookLoading,
    trades,
    tradesLoading,
    fetchDetail,
    fetchHistory,
    fetchOrderBook,
    fetchTrades,
    clearDetail,
    // 模拟交易
    positions,
    positionsLoading,
    orders,
    ordersLoading,
    trading,
    tradeError,
    lastTrade,
    fetchPositions,
    fetchOrders,
    placeOrder,
    closePosition,
    clearTradeError,
  };
});
