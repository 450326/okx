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
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time } from 'lightweight-charts';
import type { KlineItem } from '../../api/types';
import { $t } from '../../utils/i18n';

const props = defineProps<{
  klines: KlineItem[];
  loading: boolean;
  symbol: string;
  exchange?: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'clickPrice': [price: number];
}>();

const chartContainer = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<'Candlestick'> | null = null;
let volumeSeries: ISeriesApi<'Histogram'> | null = null;
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
