<template>
  <div class="probability-chart">
    <div ref="chartContainer" class="chart-container"></div>
    <div v-if="loading" class="chart-overlay">{{ $t('common.loading') }}</div>
    <div v-else-if="!points.length" class="chart-overlay">{{ $t('prediction.chartEmpty') }}</div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import type { PredictionHistoryPoint } from '../../api/types';
import { $t } from '../../utils/i18n';

// 概率走势图：把 0-1 的概率换算成 0-100 的百分比展示
const props = defineProps<{
  points: PredictionHistoryPoint[];
  loading: boolean;
}>();

const chartContainer = ref<HTMLElement | null>(null);
let chart: IChartApi | null = null;
let areaSeries: ISeriesApi<'Area'> | null = null;
let resizeObserver: ResizeObserver | null = null;

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

function buildData() {
  const sorted = props.points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p))
    .map((point) => ({
      time: Math.floor(point.t) as Time,
      value: Math.round(point.p * 1000) / 10,
    }))
    .sort((left, right) => Number(left.time) - Number(right.time));

  // lightweight-charts 要求时间严格递增，重复时间戳只保留最后一条
  const deduped: { time: Time; value: number }[] = [];
  for (const item of sorted) {
    if (deduped.length && deduped[deduped.length - 1].time === item.time) {
      deduped[deduped.length - 1] = item;
    } else {
      deduped.push(item);
    }
  }
  return deduped;
}

function updateData() {
  if (!areaSeries) return;
  areaSeries.setData(buildData());
  chart?.timeScale().fitContent();
}

function initChart() {
  if (!chartContainer.value) return;

  const dark = isDarkTheme();
  const container = chartContainer.value;

  chart = createChart(container, {
    width: container.clientWidth,
    height: 320,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: dark ? '#8b93a6' : '#657089',
    },
    grid: {
      vertLines: { color: dark ? '#202531' : '#edf2f8' },
      horzLines: { color: dark ? '#202531' : '#edf2f8' },
    },
    crosshair: { mode: 0 },
    rightPriceScale: {
      borderColor: dark ? '#2a3140' : '#d7deea',
      scaleMargins: { top: 0.12, bottom: 0.12 },
    },
    timeScale: {
      borderColor: dark ? '#2a3140' : '#d7deea',
      timeVisible: true,
      secondsVisible: false,
    },
    localization: {
      priceFormatter: (price: number) => `${price.toFixed(1)}%`,
    },
  });

  areaSeries = chart.addSeries(AreaSeries, {
    lineColor: '#bbff27',
    lineWidth: 2,
    topColor: 'rgba(187, 255, 39, 0.32)',
    bottomColor: 'rgba(187, 255, 39, 0.02)',
    priceLineVisible: false,
    lastValueVisible: true,
    priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
  });

  updateData();
}

function handleResize() {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth });
  }
}

watch(
  () => props.points,
  () => {
    void nextTick(updateData);
  },
  { deep: false },
);

onMounted(() => {
  void nextTick(initChart);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => handleResize());
    if (chartContainer.value) resizeObserver.observe(chartContainer.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (chart) {
    chart.remove();
    chart = null;
  }
  areaSeries = null;
});
</script>

<style scoped>
.probability-chart {
  position: relative;
  width: 100%;
  min-height: 320px;
}

.chart-container {
  width: 100%;
  min-height: 320px;
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  font-size: 13px;
  pointer-events: none;
}
</style>
