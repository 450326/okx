<template>
  <span class="coin-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <!-- 字母/渐变始终在底层，图片加载完成前也不会出现白圈 -->
    <span
      class="coin-fallback"
      :class="toneClass"
      :style="{ fontSize: `${Math.max(10, Math.round(size * 0.4))}px` }"
    >
      {{ letter }}
    </span>
    <img
      v-if="!failed && currentSrc"
      :src="currentSrc"
      :alt="base"
      class="coin-image"
      :class="{ loaded }"
      loading="lazy"
      referrerpolicy="no-referrer"
      @load="loaded = true"
      @error="handleError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { extractBase } from '../../utils/symbol';

const props = withDefaults(
  defineProps<{
    symbol?: string;
    size?: number;
    assetClass?: 'crypto' | 'stock';
  }>(),
  {
    symbol: '',
    size: 32,
    assetClass: 'crypto',
  },
);

const base = computed(() => extractBase(props.symbol));
const letter = computed(() => (base.value || '?').slice(0, 1));

// 优先使用 CoinCap 的图标；失败后降级到 cryptocurrency-icons，最后用字母/渐变兜底，避免出现白圈。
// 有稳定品牌图标的股票/ETF；其余股票代币直接使用字母渐变块，避免某些白色 logo 变成白圈。
const STOCK_LOGO_SYMBOLS = new Set([
  'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'AMD',
  'NFLX', 'PLTR', 'COIN', 'MSTR', 'AVGO', 'TSM', 'JPM', 'V', 'MA', 'UNH',
  'XOM', 'WMT', 'KO', 'MCD', 'ORCL', 'CRM', 'ADBE', 'CSCO', 'INTC', 'MU',
  'QCOM', 'ARM', 'ASML', 'SHOP', 'BABA', 'NKE', 'DIS', 'BA', 'GE', 'IBM',
  'PYPL', 'SONY', 'TM', 'BRKB', 'LLY', 'JNJ', 'MRK', 'PFE',
]);

const sources = computed(() => {
  const code = base.value.toLowerCase();
  if (!code) return [];
  if (props.assetClass === 'stock') {
    const ticker = base.value.toUpperCase();
    if (!STOCK_LOGO_SYMBOLS.has(ticker)) return [];
    return [
      `https://financialmodelingprep.com/image-stock/${ticker}.png`,
      `https://assets.parqet.com/logos/symbol/${ticker}?format=png`,
      `https://companiesmarketcap.com/img/company-logos/64/${ticker}.png`,
    ];
  }
  return [
    `https://assets.coincap.io/assets/icons/${code}@2x.png`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@0.18.1/32/color/${code}.png`,
  ];
});

const sourceIndex = ref(0);
const failed = ref(false);
const loaded = ref(false);
const currentSrc = computed(() => (failed.value ? '' : sources.value[sourceIndex.value] || ''));

watch(base, () => {
  sourceIndex.value = 0;
  failed.value = false;
  loaded.value = false;
});

function handleError() {
  if (sourceIndex.value < sources.value.length - 1) {
    sourceIndex.value += 1;
    loaded.value = false;
  } else {
    failed.value = true;
  }
}

const toneClass = computed(() => {
  if (props.assetClass === 'stock') return 'tone-stock';
  const code = base.value;
  if (code === 'BTC') return 'tone-btc';
  if (code === 'ETH') return 'tone-eth';
  if (code === 'SOL') return 'tone-sol';
  if (code === 'BNB') return 'tone-bnb';
  if (code === 'XRP') return 'tone-xrp';
  if (code === 'DOGE') return 'tone-doge';
  return 'tone-alt';
});
</script>

<style scoped>
.coin-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: #202531;
  vertical-align: middle;
}

.coin-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.coin-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.coin-image.loaded {
  opacity: 1;
}

.tone-btc {
  background: linear-gradient(135deg, #ffb14c, #e98b18);
}

.tone-eth {
  background: linear-gradient(135deg, #8ea2ff, #4b64f1);
}

.tone-sol {
  background: linear-gradient(135deg, #60ffd1, #6b4cff);
}

.tone-bnb {
  background: linear-gradient(135deg, #f3ba2f, #b8860b);
}

.tone-xrp {
  background: linear-gradient(135deg, #6f7c92, #2d3748);
}

.tone-doge {
  background: linear-gradient(135deg, #d6b34c, #a67c00);
}

.tone-alt {
  background: linear-gradient(135deg, #5f6b85, #2a3140);
}

.tone-stock {
  background: linear-gradient(135deg, #3b82f6, #1e3a8a);
}
</style>
