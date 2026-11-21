import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface OkxInstrument {
  instId: string;
  ctVal: number;
  ctValCcy: string;
  lotSz: number;
  minSz: number;
  tickSz: number;
  ctType: string;
  maxLeverage: number;
  /** OKX 品种状态：live / suspend / preopen / test 等 */
  state: string;
}

const OKX_BASE = 'https://www.okx.com';

@Injectable()
export class OkxInstrumentService {
  private readonly logger = new Logger(OkxInstrumentService.name);
  private readonly cache = new Map<string, { at: number; value: OkxInstrument }>();

  /**
   * @param options.fresh 跳过 10 分钟缓存强制回源，下单前做二次校验时使用
   */
  async get(instId: string, options: { fresh?: boolean } = {}): Promise<OkxInstrument> {
    const key = String(instId || '').toUpperCase();
    const cached = this.cache.get(key);
    if (!options.fresh && cached && Date.now() - cached.at < 10 * 60_000) return cached.value;

    try {
      const res = await axios.get<{ code: string; data: any[] }>(`${OKX_BASE}/api/v5/public/instruments`, {
        params: { instType: 'SWAP', instId: key },
        timeout: 10000,
        proxy: false,
      });
      const item = res.data?.data?.[0];
      if (res.data?.code !== '0' || !item) {
        throw new Error(`OKX 未返回 ${key} 合约信息`);
      }
      const value: OkxInstrument = {
        instId: item.instId,
        ctVal: Number(item.ctVal) || 1,
        ctValCcy: String(item.ctValCcy || ''),
        lotSz: Number(item.lotSz) || 0.01,
        minSz: Number(item.minSz) || Number(item.lotSz) || 0.01,
        tickSz: Number(item.tickSz) || 0.01,
        ctType: String(item.ctType || 'linear'),
        maxLeverage: Number(item.lever) || 1,
        state: String(item.state || 'live'),
      };
      this.cache.set(key, { at: Date.now(), value });
      return value;
    } catch (error) {
      this.logger.warn(`获取 OKX 合约信息失败 ${key}: ${(error as Error).message}`);
      throw error;
    }
  }

  qtyToContracts(baseQty: number, instrument: OkxInstrument): number {
    const raw = baseQty / (instrument.ctVal || 1);
    return this.floorToStep(raw, instrument.lotSz || 0.01);
  }

  contractsToQty(contracts: number, instrument: OkxInstrument): number {
    return contracts * (instrument.ctVal || 1);
  }

  priceToTick(price: number, instrument: OkxInstrument): number {
    const tick = instrument.tickSz || 0.01;
    return Math.round(price / tick) * tick;
  }

  private floorToStep(value: number, step: number): number {
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(step) || step <= 0) return 0;
    const precision = this.decimals(step);
    const factor = 10 ** precision;
    return Math.floor((value * factor) / (step * factor)) * step;
  }

  private decimals(value: number): number {
    const text = String(value);
    const dot = text.indexOf('.');
    return dot >= 0 ? text.length - dot - 1 : 0;
  }
}
