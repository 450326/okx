// 预测市场模块对外数据结构
// 价格统一使用 0-1 的概率（Polymarket 的 YES/NO 代币价格本身就是概率）。

// 列表排序方式
export type PredictionSort = 'volume' | 'liquidity' | 'newest' | 'ending';

// 二元结果（YES / NO）
export interface PredictionOutcome {
  // 结果名称，通常是 Yes / No；多结果事件里可能是候选人名
  name: string;
  // 概率价格（0-1）
  price: number;
  // CLOB token id，用于查询盘口和价格历史
  tokenId: string;
}

// 预测市场列表项
export interface PredictionMarket {
  id: string;
  slug: string;
  question: string;
  description: string;
  // 市场配图 / 图标
  image: string;
  icon: string;
  // 所属事件（Polymarket 用事件把同一主题的多个市场归组）
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  outcomes: PredictionOutcome[];
  // YES 概率（0-1）
  yesPrice: number;
  // NO 概率（0-1）
  noPrice: number | null;
  // 24 小时概率变化，单位是 1（例如 -0.024 表示 -2.4 个百分点）
  change24h: number | null;
  // 盘口
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  // 成交量 / 流动性（USDC）
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  negRisk: boolean;
  resolutionSource: string;
}

// 列表响应
export interface PredictionMarketList {
  list: PredictionMarket[];
  // 搜索结果能给出准确总数；Gamma 分页列表无法得知总数，返回 null
  total: number | null;
  offset: number;
  limit: number;
  hasMore: boolean;
  // 数据源是否正常返回
  upstream: boolean;
  // 数据源异常时的提示，前端用于展示“上游接口暂不可用”
  message?: string;
}

// 详情页的相关市场摘要
export interface PredictionMarketSummary {
  id: string;
  slug: string;
  question: string;
  icon: string;
  yesPrice: number;
  volumeTotal: number;
  endDate: string | null;
}

// 详情响应
export interface PredictionMarketDetail {
  market: PredictionMarket;
  related: PredictionMarketSummary[];
}

// 概率历史点，t 为秒级时间戳，p 为概率
export interface PredictionHistoryPoint {
  t: number;
  p: number;
}

export interface PredictionHistory {
  slug: string;
  tokenId: string;
  interval: string;
  fidelity: number;
  points: PredictionHistoryPoint[];
}

// 盘口档位
export interface PredictionBookLevel {
  price: number;
  size: number;
}

export interface PredictionOrderBook {
  slug: string;
  tokenId: string;
  midpoint: number | null;
  spread: number | null;
  bids: PredictionBookLevel[];
  asks: PredictionBookLevel[];
}

// 最近成交
export interface PredictionTrade {
  id: string;
  side: 'buy' | 'sell';
  outcome: string;
  outcomeIndex: number;
  price: number;
  size: number;
  value: number;
  ts: number;
}
