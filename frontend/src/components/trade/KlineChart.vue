<template>
  <section class="card kline-card">
    <div class="kline-header">
      <div class="kline-header-left">
        <h2 class="section-title">{{ symbol }} K线图</h2>
        <span class="status-text">{{ loading ? '加载中...' : `${klines.length} 根K线` }}</span>
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
    <div v-if="!klines.length && !loading" class="empty-state">暂无K线数据</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time } from 'lightweight-charts';
import type { KlineItem } from '../../api/types';

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

const intervals = computed(() => [
  { label: '1秒', value: '1s', disabled: props.exchange === 'binance' || props.exchange === 'uniswap' || props.exchange === 'polymarket' },
  { label: '30秒', value: '30s', disabled: props.exchange === 'binance' || props.exchange === 'uniswap' || props.exchange === 'polymarket' },
  { label: '1分', value: '1m', disabled: false },
  { label: '5分', value: '5m', disabled: false },
  { label: '15分', value: '15m', disabled: false },
  { label: '30分', value: '30m', disabled: false },
  { label: '1H', value: '1H', disabled: false },
  { label: '4H', value: '4H', disabled: props.exchange === 'uniswap' },
  { label: '1天', value: '1D', disabled: false },
]);

const isSecondsInterval = computed(() => props.modelValue === '1s' || props.modelValue === '30s');

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
    grid: {
      vertLines: { color: isDark ? '#202531' : '#edf2f8' },
      horzLines: { color: isDark ? '#202531' : '#edf2f8' },
    },
    crosshair: {
      mode: 0,
    },
    rightPriceScale: {
      borderColor: isDark ? '#2a3140' : '#d7deea',
    },
    timeScale: {
      borderColor: isDark ? '#2a3140' : '#d7deea',
      timeVisible: true,
      secondsVisible: isSecondsInterval.value,
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

  updateChartData();
}

function updateChartData() {
  if (!candleSeries || !volumeSeries) return;
  const candles = buildCandleData(props.klines).reverse();
  const volumes = buildVolumeData(props.klines).reverse();
  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  chart?.timeScale().fitContent();
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

watch(() => props.klines, () => { nextTick(updateChartData); }, { deep: false });

watch(
  () => [props.symbol, props.modelValue],
  () => {
    nextTick(applyTimeScaleOptions);
    chart?.timeScale().fitContent();
  },
);

onMounted(() => {
  nextTick(() => {
    initChart();
    window.addEventListener('resize', handleResize);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  chart?.remove();
  chart = null;
  candleSeries = null;
  volumeSeries = null;
});
</script>

<style scoped>
.kline-card {
  display: flex;
  flex-direction: column;
}

.kline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.kline-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.interval-group {
  display: flex;
  gap: 4px;
  background: var(--bg-soft);
  padding: 3px;
  border-radius: 10px;
  flex-wrap: wrap;
}

.interval-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.15s ease;
}

.interval-btn:hover:not(.disabled) {
  color: var(--text-primary);
}

.interval-btn.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.interval-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chart-container {
  width: 100%;
  height: 460px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
