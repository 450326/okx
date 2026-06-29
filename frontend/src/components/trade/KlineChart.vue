<template>
  <!-- K 线图卡片容器 -->
  <section class="card kline-card">
    <!-- K 线图头部：标题 + 时间周期切换按钮 -->
    <div class="kline-header">
      <!-- 左侧：标题与数据统计状态 -->
      <div class="kline-header-left">
        <h2 class="section-title">{{ symbol }} K线图</h2>
        <span class="status-text">{{ loading ? '加载中...' : `${klines.length} 根K线` }}</span>
      </div>
      <!-- 右侧：时间周期按钮组 -->
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
    <!-- K 线图渲染容器 -->
    <div ref="chartContainer" class="chart-container"></div>
    <!-- 无数据时的空状态提示 -->
    <div v-if="!klines.length && !loading" class="empty-state">暂无K线数据</div>
  </section>
</template>

<script setup lang="ts">
// 导入 Vue 生命周期与响应式工具
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
// 导入轻量级 K 线图库
import { createChart, ColorType, CandlestickSeries, HistogramSeries, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time } from 'lightweight-charts';
// 导入 K 线数据类型定义
import type { KlineItem } from '../../api/types';

// 定义组件 props：K 线数据、加载状态、交易对、交易所、当前时间周期
const props = defineProps<{
  klines: KlineItem[];
  loading: boolean;
  symbol: string;
  exchange?: string;
  modelValue: string;
}>();

// 定义组件事件：更新时间周期 / 点击价格
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'clickPrice': [price: number];
}>();

// 图表 DOM 容器引用
const chartContainer = ref<HTMLElement | null>(null);
// 图表实例变量
let chart: IChartApi | null = null;
// K 线图系列实例变量
let candleSeries: ISeriesApi<'Candlestick'> | null = null;
// 成交量柱状图系列实例变量
let volumeSeries: ISeriesApi<'Histogram'> | null = null;

// 根据交易所计算可用的时间周期列表
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

// 判断是否为秒级时间周期
const isSecondsInterval = computed(() => props.modelValue === '1s' || props.modelValue === '30s');

// 将 K 线数据构建为图表 CandlestickData 格式
function buildCandleData(items: KlineItem[]): CandlestickData[] {
  return items.map((k) => ({
    time: Math.floor(k.openTime / 1000) as Time,
    open: Number(k.open),
    high: Number(k.high),
    low: Number(k.low),
    close: Number(k.close),
  }));
}

// 将 K 线数据构建为图表成交量 HistogramData 格式
function buildVolumeData(items: KlineItem[]): HistogramData[] {
  return items.map((k) => ({
    time: Math.floor(k.openTime / 1000) as Time,
    value: Number(k.volume),
    color: Number(k.close) >= Number(k.open) ? 'rgba(0,192,135,0.3)' : 'rgba(246,70,93,0.3)',
  }));
}

// 初始化图表
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

  // 添加 K 线图系列
  candleSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#00c087',
    downColor: '#f6465d',
    borderUpColor: '#00c087',
    borderDownColor: '#f6465d',
    wickUpColor: '#00c087',
    wickDownColor: '#f6465d',
  });

  // 添加成交量柱状图系列
  volumeSeries = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });

  // 配置成交量价格轴边距
  volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  // 订阅十字光标移动事件：更改鼠标样式
  chart.subscribeCrosshairMove((param) => {
    if (param.time && param.point) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = 'default';
    }
  });

  // 订阅点击事件：发出当前收盘价
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

  // 初始化数据
  updateChartData();
}

// 更新图表数据
function updateChartData() {
  if (!candleSeries || !volumeSeries) return;
  const candles = buildCandleData(props.klines).reverse();
  const volumes = buildVolumeData(props.klines).reverse();
  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  chart?.timeScale().fitContent();
}

// 处理窗口大小变化
function handleResize() {
  if (chart && chartContainer.value) {
    chart.applyOptions({ width: chartContainer.value.clientWidth });
  }
}

// 更新时间刻度显示选项
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

// 监听 K 线数据变化并更新图表
watch(() => props.klines, () => { nextTick(updateChartData); }, { deep: false });

// 监听交易对或时间周期变化
watch(
  () => [props.symbol, props.modelValue],
  () => {
    nextTick(applyTimeScaleOptions);
    chart?.timeScale().fitContent();
  },
);

// 组件挂载后初始化图表并注册窗口缩放监听
onMounted(() => {
  nextTick(() => {
    initChart();
    window.addEventListener('resize', handleResize);
  });
});

// 组件卸载前清理图表实例和事件监听
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  chart?.remove();
  chart = null;
  candleSeries = null;
  volumeSeries = null;
});
</script>

<style scoped>
/* K 线图卡片采用 flex 列布局 */
.kline-card {
  display: flex;
  flex-direction: column;
}

/* K 线图头部：标题与周期切换按钮水平分布 */
.kline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

/* 左侧标题区域 */
.kline-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 周期切换按钮组 */
.interval-group {
  display: flex;
  gap: 4px;
  background: var(--bg-soft);
  padding: 3px;
  border-radius: 10px;
  flex-wrap: wrap;
}

/* 单个周期切换按钮 */
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

/* 按钮悬浮效果 */
.interval-btn:hover:not(.disabled) {
  color: var(--text-primary);
}

/* 激活态按钮 */
.interval-btn.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* 禁用态按钮 */
.interval-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 图表渲染容器 */
.chart-container {
  width: 100%;
  height: 460px;
  border-radius: 12px;
  overflow: hidden;
}
</style>
