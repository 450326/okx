<template>
  <section class="card kline-card">
    <div class="kline-header">
      <div class="kline-header-left">
        <h2 class="section-title">{{ symbol }} {{ $t('kline.title') }}</h2>
        <span class="status-text">{{ loading ? $t('common.loading') : `${klines.length} ${$t('kline.candles')}` }}</span>
      </div>
      <div class="interval-group">
        <button
          v-for="item in intervals"
          :key="item.value"
          :class="['interval-btn', { active: item.value === modelValue, disabled: item.disabled }]"
          :disabled="item.disabled"
          @click="item.disabled ? undefined : $emit('update:modelValue', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div ref="chartContainer" class="chart-container"></div>
    <div v-if="!klines.length && !loading" class="empty-state">{{ $t('kline.noData') }}</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  type AutoscaleInfo,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type CandlestickData,
  type HistogramData,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { KlineItem, KlineTradeMarker, PositionItem } from '../../api/types';
import { $t } from '../../utils/i18n';

const props = defineProps<{
  klines: KlineItem[];
  loading: boolean;
  symbol: string;
  exchange?: string;
  modelValue: string;
  // 当前品种的已成交订单，用于在 K 线上打 B/S 标记
  tradeMarkers?: KlineTradeMarker[];
  // 当前品种持仓，用于绘制开仓/强平盈亏虚线
  position?: PositionItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'clickPrice': [price: number];
}>();

const chartContainer = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<'Candlestick'> | null = null;
let volumeSeries: ISeriesApi<'Histogram'> | null = null;
let markersApi: ISeriesMarkersPluginApi<Time> | null = null;
let entryPriceLine: IPriceLine | null = null;
let liquidationPriceLine: IPriceLine | null = null;
// 让开仓/强平价也参与价格轴自动缩放，避免价格走远后虚线跑到可视区外
let positionPriceLevels: number[] = [];
let isInitialLoad = true;
let lastSymbol = '';
let lastDataLength = 0;

const intervals = computed(() => [
  { label: $t('chart.interval1s'), value: '1s', disabled: props.exchange === 'binance' || props.exchange === 'coinbase' || props.exchange === 'uniswap' },
  { label: $t('chart.interval30s'), value: '30s', disabled: props.exchange === 'binance' || props.exchange === 'coinbase' || props.exchange === 'uniswap' },
  { label: $t('chart.interval1m'), value: '1m', disabled: false },
  { label: $t('chart.interval5m'), value: '5m', disabled: false },
  { label: $t('chart.interval15m'), value: '15m', disabled: false },
  { label: $t('chart.interval30m'), value: '30m', disabled: false },
  { label: $t('chart.interval1h'), value: '1h', disabled: false },
  { label: $t('chart.interval4h'), value: '4h', disabled: props.exchange === 'uniswap' },
  { label: $t('chart.interval1d'), value: '1d', disabled: false },
]);

const isSecondsInterval = computed(() => props.modelValue === '1s' || props.modelValue === '30s');

// lightweight-charts 要求数据按时间升序且不能重复；请求/实时推送可能乱序，
// 这里统一去重、排序，避免偶尔一条乱序数据导致整张图渲染失败。
function normalizeKlines(items: KlineItem[]): KlineItem[] {
  const byTime = new Map<number, KlineItem>();
  for (const item of items) {
    const openTime = Number(item.openTime);
    if (!Number.isFinite(openTime)) continue;
    byTime.set(openTime, item);
  }
  return Array.from(byTime.values()).sort((a, b) => a.openTime - b.openTime);
}

function buildCandleData(items: KlineItem[]): CandlestickData[] {
  return items.map((k) => ({
    time: Math.floor(k.openTime / 1000) as Time,
    open: Number(k.open),
    high: Number(k.high),
    low: Number(k.low),
    close: Number(k.close),
  }));
}

function buildVolumeData(items: KlineItem[]): HistogramData[] {
  return items.map((k) => ({
    time: Math.floor(k.openTime / 1000) as Time,
    value: Number(k.volume),
    color: Number(k.close) >= Number(k.open) ? 'rgba(0,192,135,0.3)' : 'rgba(246,70,93,0.3)',
  }));
}

// 把成交时间对齐到它所在的 K 线，避免 lightweight-charts 因时间点不存在而不显示标记
function findBarTime(barTimes: number[], target: number): number | null {
  if (!barTimes.length || target < barTimes[0]) return null;
  let low = 0;
  let high = barTimes.length - 1;
  let result = barTimes[0];
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (barTimes[mid] <= target) {
      result = barTimes[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

function buildTradeMarkers(items: KlineItem[]): SeriesMarker<Time>[] {
  const trades = props.tradeMarkers ?? [];
  if (!trades.length || !items.length) return [];

  const barTimes = items.map((k) => Math.floor(k.openTime / 1000));
  const markers: SeriesMarker<Time>[] = [];

  for (const trade of trades) {
    const markerTime = Math.floor(Number(trade.time) / 1000);
    if (!Number.isFinite(markerTime)) continue;
    const barTime = findBarTime(barTimes, markerTime);
    if (barTime == null) continue;

    const isBuy = trade.side === 'buy';
    markers.push({
      time: barTime as Time,
      position: isBuy ? 'belowBar' : 'aboveBar',
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      color: isBuy ? '#00c087' : '#f6465d',
      text: isBuy ? 'B' : 'S',
      size: 1.5,
    });
  }

  return markers.sort((a, b) => Number(a.time) - Number(b.time));
}

function updateTradeMarkers(items: KlineItem[]) {
  if (!markersApi) return;
  markersApi.setMarkers(buildTradeMarkers(items));
}

function formatChartPrice(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatChartPnl(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

// 把开仓价/强平价纳入价格轴范围，价格波动大时虚线也不会跑出屏幕
function applyPositionAutoscale() {
  if (!candleSeries) return;
  const levels = positionPriceLevels.filter((value) => Number.isFinite(value) && value > 0);
  candleSeries.applyOptions({
    autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
      const info = original();
      if (!levels.length) return info;
      const baseMin = info?.priceRange?.minValue;
      const baseMax = info?.priceRange?.maxValue;
      const minValue = baseMin == null ? Math.min(...levels) : Math.min(baseMin, ...levels);
      const maxValue = baseMax == null ? Math.max(...levels) : Math.max(baseMax, ...levels);
      return { priceRange: { minValue, maxValue }, margins: info?.margins };
    },
  });
}

// 持仓开仓价虚线：颜色跟随盈亏，标题显示当前浮动盈亏
function updatePositionLines() {
  if (!candleSeries) return;

  const position = props.position;
  const entry = Number(position?.entryPrice);
  const liquidation = Number(position?.liquidationPrice);
  const pnl = Number(position?.unrealizedPnl || 0);

  const nextLevels = [entry, liquidation].filter((value) => Number.isFinite(value) && value > 0);
  const levelsChanged =
    nextLevels.length !== positionPriceLevels.length ||
    nextLevels.some((value, index) => Math.abs(value - positionPriceLevels[index]) > 1e-9);
  if (levelsChanged) {
    positionPriceLevels = nextLevels;
    applyPositionAutoscale();
  }

  if (position && Number.isFinite(entry) && entry > 0) {
    const color = pnl >= 0 ? '#00c087' : '#f6465d';
    const title = `${$t('kline.entry')} ${formatChartPrice(entry)} · ${$t('kline.pnl')} ${formatChartPnl(pnl)}`;
    if (!entryPriceLine) {
      entryPriceLine = candleSeries.createPriceLine({
        price: entry,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
    } else {
      entryPriceLine.applyOptions({ price: entry, color, title });
    }
  } else if (entryPriceLine) {
    candleSeries.removePriceLine(entryPriceLine);
    entryPriceLine = null;
  }

  if (position && Number.isFinite(liquidation) && liquidation > 0) {
    const title = `${$t('kline.liquidation')} ${formatChartPrice(liquidation)}`;
    if (!liquidationPriceLine) {
      liquidationPriceLine = candleSeries.createPriceLine({
        price: liquidation,
        color: '#f5a623',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
    } else {
      liquidationPriceLine.applyOptions({ price: liquidation, title });
    }
  } else if (liquidationPriceLine) {
    candleSeries.removePriceLine(liquidationPriceLine);
    liquidationPriceLine = null;
  }
}

function initChart() {
  if (!chartContainer.value) return;

  const container = chartContainer.value;
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  chart = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isDark ? '#8b93a6' : '#657089',
    },
    localization: {
      timeFormatter: (time: number) => {
        const d = new Date(time * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
    },
    grid: {
      vertLines: { color: isDark ? '#202531' : '#edf2f8' },
      horzLines: { color: isDark ? '#202531' : '#edf2f8' },
    },
    crosshair: {
      mode: 0,
    },
    // 允许鼠标拖拽平移、滚轮缩放，触屏也支持拖动
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
    kineticScroll: {
      mouse: true,
      touch: true,
    },
    rightPriceScale: {
      borderColor: isDark ? '#2a3140' : '#d7deea',
    },
    timeScale: {
      borderColor: isDark ? '#2a3140' : '#d7deea',
      timeVisible: true,
      secondsVisible: isSecondsInterval.value,
      tickMarkFormatter: (time: number) => {
        const d = new Date(time * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const h = pad(d.getHours());
        const m = pad(d.getMinutes());
        const s = isSecondsInterval.value ? `:${pad(d.getSeconds())}` : '';
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${h}:${m}${s}`;
      },
    },
    width: container.clientWidth,
    height: 460,
  });

  candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#00c087',
    downColor: '#f6465d',
    borderUpColor: '#00c087',
    borderDownColor: '#f6465d',
    wickUpColor: '#00c087',
    wickDownColor: '#f6465d',
  });

  volumeSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });

  // 成交标记插件：B 买 / S 卖
  markersApi = createSeriesMarkers(candleSeries, []);

  volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  chart.subscribeCrosshairMove((param) => {
    if (param.time && param.point) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = 'default';
    }
  });

  chart.subscribeClick((param) => {
    if (!param.point || !candleSeries) return;
    const data = param.seriesData?.get(candleSeries);
    if (data) {
      const candle = data as CandlestickData;
      if (candle.close !== undefined) {
        emit('clickPrice', candle.close);
      }
    }
  });

  isInitialLoad = true;
  updateChartData();
  updatePositionLines();
}

function updateChartData() {
  if (!candleSeries || !volumeSeries) return;
  const items = normalizeKlines(props.klines);
  const timeScale = chart?.timeScale();
  const rangeBefore = !isInitialLoad ? timeScale?.getVisibleLogicalRange() ?? null : null;
  const timeRangeBefore = rangeBefore ? timeScale?.getVisibleRange() ?? null : null;
  // 更新前视口右端是否贴着最新一根 K 线
  const wasAtLatest = rangeBefore ? rangeBefore.to >= lastDataLength - 2 : true;

  candleSeries.setData(buildCandleData(items));
  volumeSeries.setData(buildVolumeData(items));
  updateTradeMarkers(items);
  lastDataLength = items.length;

  if (!items.length) return;

  // 首次加载/切换品种周期时定位到最新一根；用户拖到历史区域后，
  // 实时刷新只恢复原来的视口，不能把画面抢回最右侧。
  if (isInitialLoad || wasAtLatest) {
    timeScale?.scrollToPosition(0, false);
    isInitialLoad = false;
  } else if (timeRangeBefore) {
    timeScale?.setVisibleRange(timeRangeBefore);
  } else if (rangeBefore) {
    timeScale?.setVisibleLogicalRange(rangeBefore);
  }

  // K 线重绘后再次应用持仓虚线，避免切换交易所/刷新后虚线丢失
  updatePositionLines();
}

function handleResize() {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth });
  }
}

function applyTimeScaleOptions() {
  if (chart) {
    chart.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: isSecondsInterval.value,
      },
    });
  }
}

watch(() => [props.klines, props.symbol, props.modelValue], () => {
  if (props.symbol !== lastSymbol) {
    lastSymbol = props.symbol;
    isInitialLoad = true;
  }
  nextTick(updateChartData);
}, { deep: false });

watch(() => props.modelValue, () => {
  isInitialLoad = true;
  nextTick(() => {
    applyTimeScaleOptions();
    updateChartData();
  });
});

// 订单成交后刷新 B/S 标记
watch(() => props.tradeMarkers, () => {
  nextTick(() => updateTradeMarkers(normalizeKlines(props.klines)));
});

// 持仓变化时刷新开仓/强平盈亏虚线
watch(() => props.position, () => {
  nextTick(updatePositionLines);
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => {
    initChart();
  });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => handleResize());
    if (chartContainer.value) {
      resizeObserver.observe(chartContainer.value);
    }
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (chart) {
    chart.remove();
    chart = null;
  }
  candleSeries = null;
  volumeSeries = null;
  markersApi = null;
  entryPriceLine = null;
  liquidationPriceLine = null;
  positionPriceLevels = [];
});
</script>

<style scoped>
.kline-card {
  padding: 22px;
}

.kline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.kline-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.interval-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.interval-btn {
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.interval-btn.active {
  border-color: rgba(187, 255, 39, 0.36);
  background: rgba(187, 255, 39, 0.1);
  color: #bbff27;
}

.interval-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chart-container {
  width: 100%;
  min-height: 460px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.chart-container:active {
  cursor: grabbing;
}
</style>
