<template>
  <div class="equity-chart-wrapper">
    <div class="equity-head">
      <h2 class="section-title">资金曲线</h2>
      <div class="equity-tabs">
        <button
          v-for="r in ranges"
          :key="r.key"
          :class="['range-chip', { active: activeRange === r.key }]"
          @click="switchRange(r.key)"
        >
          {{ r.label }}
        </button>
      </div>
      <div class="equity-mode-tabs">
        <button
          :class="['mode-chip', { active: activeMode === 'simulation' }]"
          @click="switchMode('simulation')"
        >
          模拟盘
        </button>
        <button
          :class="['mode-chip', { active: activeMode === 'live' }]"
          @click="switchMode('live')"
        >
          实盘
        </button>
      </div>
    </div>

    <div class="equity-stats">
      <div class="eq-stat">
        <span>起始权益</span>
        <strong>{{ formatEquity(startEquity) }}</strong>
      </div>
      <div class="eq-stat">
        <span>当前权益</span>
        <strong>{{ formatEquity(endEquity) }}</strong>
      </div>
      <div class="eq-stat">
        <span>收益</span>
        <strong :class="getTrendClass(returnAmount)">{{ formatSignedValue(returnAmount) }}</strong>
      </div>
      <div class="eq-stat">
        <span>收益率</span>
        <strong :class="getTrendClass(returnPct)">{{ returnPct >= 0 ? '+' : '' }}{{ returnPct.toFixed(2) }}%</strong>
      </div>
    </div>

    <div v-if="!points.length" class="chart-empty">
      <div class="empty-text">暂无数据 — 请连接到实盘交易所</div>
    </div>
    <div v-else ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type LineData, type Time, ColorType } from 'lightweight-charts';
import { accountApi } from '../../api/services';
import { formatSignedValue, getTrendClass } from '../../utils/format';
import type { EquityPoint } from '../../api/types';

const props = withDefaults(defineProps<{
  mode?: 'simulation' | 'live';
  range?: string;
}>(), {
  mode: 'simulation',
  range: '30d',
});

const emit = defineEmits<{
  (e: 'update:mode', val: 'simulation' | 'live'): void;
  (e: 'update:range', val: string): void;
}>();

const ranges = [
  { key: '1d', label: '1天' },
  { key: '7d', label: '7天' },
  { key: '30d', label: '30天' },
  { key: '90d', label: '90天' },
  { key: '1y', label: '1年' },
];

const activeRange = ref(props.range);
const activeMode = ref(props.mode);
const chartContainer = ref<HTMLDivElement | null>(null);
const points = ref<EquityPoint[]>([]);

let chart: IChartApi | null = null;
let lineSeries: ISeriesApi<'Line'> | null = null;

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

function formatSignedValue(val: number): string {
  if (val > 0) return `+${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (val < 0) return `${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return '0';
}

async function fetchData() {
  try {
    const data = await accountApi.getEquityHistory(activeMode.value, activeRange.value);
    points.value = data.points;
    updateChart();
  } catch {
    points.value = [];
  }
}

function switchRange(key: string) {
  activeRange.value = key;
  emit('update:range', key);
  void fetchData();
}

function switchMode(mode: 'simulation' | 'live') {
  activeMode.value = mode;
  emit('update:mode', mode);
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
  if (!lineSeries || !points.value.length) return;

  const data: LineData[] = points.value.map((p) => ({
    time: (p.ts / 1000) as Time,
    value: p.equity,
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

watch(() => props.mode, (val) => {
  if (val && val !== activeMode.value) {
    activeMode.value = val;
    void fetchData();
  }
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

.equity-tabs,
.equity-mode-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-soft);
  padding: 3px;
  border-radius: 10px;
}

.range-chip,
.mode-chip {
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

.range-chip.active,
.mode-chip.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.range-chip:hover,
.mode-chip:hover {
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

.chart-container {
  width: 100%;
  height: 320px;
  border-radius: 12px;
  overflow: hidden;
}

.chart-empty {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--bg-soft);
}

.empty-text {
  color: var(--text-secondary);
  font-size: 15px;
}
</style>
