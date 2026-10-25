<template>
  <div class="equity-chart-wrapper">
    <div class="equity-head">
      <h2 class="section-title">{{ $t('equity.equityCurve') }}</h2>
      <div class="equity-tabs">
        <button
          v-for="r in ranges"
          :key="r.key"
          :class="['range-chip', { active: activeRange === r.key }]"
          @click="switchRange(r.key)"
        >
          {{ $t(r.labelKey) }}
        </button>
      </div>
    </div>

    <div class="equity-stats">
      <div class="eq-stat">
        <span>{{ $t('equity.startEquity') }}</span>
        <strong>{{ formatEquity(startEquity) }}</strong>
      </div>
      <div class="eq-stat">
        <span>{{ $t('equity.currentEquity') }}</span>
        <strong>{{ formatEquity(endEquity) }}</strong>
      </div>
      <div class="eq-stat">
        <span>{{ $t('equity.return') }}</span>
        <strong :class="getTrendClass(returnAmount)">{{ formatSignedValue(returnAmount) }}</strong>
      </div>
      <div class="eq-stat">
        <span>{{ $t('equity.returnRate') }}</span>
        <strong :class="getTrendClass(returnPct)">{{ returnPct >= 0 ? '+' : '' }}{{ returnPct.toFixed(2) }}%</strong>
      </div>
    </div>

    <div class="equity-chart-area">
      <div ref="chartContainer" class="chart-container"></div>
      <div v-if="!points.length" class="chart-empty-overlay">
        <div class="empty-text">{{ $t('equity.noLiveData') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type LineData, type Time, ColorType } from 'lightweight-charts';
import { accountApi } from '../../api/services';
import { formatSignedValue, getTrendClass } from '../../utils/format';
import { $t } from '../../utils/i18n';
import type { EquityPoint } from '../../api/types';

const props = withDefaults(defineProps<{
  mode?: 'simulation' | 'live';
  range?: string;
}>(), {
  mode: 'simulation',
  range: '30d',
});

const emit = defineEmits<{
  (e: 'update:range', val: string): void;
}>();

const ranges = [
  { key: '1d', labelKey: 'equity.day1' },
  { key: '7d', labelKey: 'equity.day7' },
  { key: '30d', labelKey: 'equity.day30' },
  { key: '90d', labelKey: 'equity.day90' },
  { key: '1y', labelKey: 'equity.year1' },
];

const activeRange = ref(props.range);
const chartContainer = ref<HTMLDivElement | null>(null);
const points = ref<EquityPoint[]>([]);

let chart: IChartApi | null = null;
let lineSeries: ISeriesApi<'Line'> | null = null;
// 快速切换周期/模式时丢弃过期响应
let requestSeq = 0;

const startEquity = computed(() => points.value[0]?.equity ?? 0);
const endEquity = computed(() => points.value[points.value.length - 1]?.equity ?? 0);
const returnAmount = computed(() => endEquity.value - startEquity.value);
const returnPct = computed(() => {
  if (!startEquity.value) return 0;
  return (returnAmount.value / startEquity.value) * 100;
});

function formatEquity(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function fetchData() {
  const seq = ++requestSeq;
  try {
    const data = await accountApi.getEquityHistory(props.mode, activeRange.value);
    if (seq !== requestSeq) return;
    points.value = data.points;
  } catch {
    if (seq !== requestSeq) return;
    points.value = [];
  }
  // 图表容器始终存在，切换模式/周期后复用同一个实例，
  // 避免清空数据时 DOM 被销毁导致再切回来画不出来。
  if (!chart) initChart();
  updateChart();
}

function switchRange(key: string) {
  activeRange.value = key;
  emit('update:range', key);
  void fetchData();
}

function initChart() {
  if (!chartContainer.value) return;

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: 320,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isDark ? '#787c87' : '#8a8d96',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
      horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
    },
    crosshair: {
      vertLine: { color: isDark ? '#63ff98' : '#1dd15f', width: 1, style: 2 },
      horzLine: { color: isDark ? '#63ff98' : '#1dd15f', width: 1, style: 2 },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
    },
    handleScroll: false,
    handleScale: false,
  });

  lineSeries = chart.addSeries(LineSeries, {
    color: '#63ff98',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    crosshairMarkerBorderColor: '#63ff98',
    crosshairMarkerBackgroundColor: '#0a0e18',
    lastValueVisible: true,
    priceFormat: {
      type: 'custom',
      formatter: (price: number) => price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
  });

  const themeObserver = new MutationObserver(() => {
    if (chart) {
      const dark = document.documentElement.getAttribute('data-theme') !== 'light';
      chart.applyOptions({
        layout: { textColor: dark ? '#787c87' : '#8a8d96' },
        grid: {
          vertLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
          horzLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        },
      });
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.addEventListener('resize', handleResize);
}

function updateChart() {
  if (!lineSeries) return;
  if (!points.value.length) {
    lineSeries.setData([]);
    return;
  }

  // lightweight-charts 只接受整数秒且时间必须严格递增，同一秒保留最后一条。
  const bySecond = new Map<number, EquityPoint>();
  for (const point of points.value) {
    bySecond.set(Math.floor(point.ts / 1000), point);
  }
  const data: LineData[] = Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, point]) => ({
      time: time as Time,
      value: point.equity,
    }));
  lineSeries.setData(data);

  if (chart) chart.timeScale().fitContent();
}

function handleResize() {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth });
  }
}

onMounted(() => {
  initChart();
  void fetchData();
});

onUnmounted(() => {
  if (chart) {
    chart.remove();
    chart = null;
  }
  lineSeries = null;
});

watch(() => props.mode, () => {
  void fetchData();
});

watch(() => props.range, (val) => {
  if (val && val !== activeRange.value) {
    activeRange.value = val;
    void fetchData();
  }
});
</script>

<style scoped>
.equity-chart-wrapper {
  width: 100%;
}

.equity-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.equity-head .section-title {
  margin-right: auto;
  margin-bottom: 0;
}

.equity-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-soft);
  padding: 3px;
  border-radius: 10px;
}

.range-chip {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.range-chip.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.range-chip:hover {
  color: var(--text-primary);
}

.equity-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.eq-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eq-stat span {
  font-size: 12px;
  color: var(--text-secondary);
}

.eq-stat strong {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.equity-chart-area {
  position: relative;
  width: 100%;
  height: 320px;
}

.chart-container {
  width: 100%;
  height: 320px;
  border-radius: 12px;
  overflow: hidden;
}

.chart-empty-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--bg-soft);
}

.empty-text {
  color: var(--text-secondary);
  font-size: 15px;
}
</style>
