export interface LeverageTier {
  maxLeverage: number;
  maintenanceMarginRate?: number;
}

export interface InstrumentMeta {
  symbol: string;
  baseCoin?: string;
  quoteCoin?: string;
  maxLeverage: number;
  /** 基础币最小下单量；OKX 合约会按 ctVal 从张数换算。 */
  minQty: string;
  /** 最小名义价值（USDT）；0 表示按 minQty × 当前价动态计算。 */
  minNotional?: string;
  pricePrecision: number;
  qtyPrecision: number;
  assetClass?: 'crypto' | 'stock';
  leverageTiers?: LeverageTier[];
  maintenanceMarginRate?: number;
  tradable?: boolean;
  tradableModes?: Array<'simulation' | 'live'>;
  status?: string;
}
