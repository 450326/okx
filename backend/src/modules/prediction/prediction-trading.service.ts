import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SimulationState } from '../simulation/simulation-state';
import {
  PredictionMarketSnapshot,
  PredictionOrderInput,
  SIM_ERROR,
  SimulationError,
} from '../simulation/simulation.types';
import { PolymarketService } from './polymarket.service';

/**
 * 预测市场模拟交易门面。
 *
 * 这里只负责把 Polymarket 的最新概率转成行情快照，账务/持仓/钱包全部复用
 * SimulationState 与 SimulationEngine，因此和合约模拟盘共用同一份资金。
 */
@Injectable()
export class PredictionTradingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PredictionTradingService.name);
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;

  constructor(
    private readonly polymarket: PolymarketService,
    private readonly sim: SimulationState,
  ) {}

  onModuleInit(): void {
    void this.refreshMarks();
    this.timer = setInterval(() => {
      void this.refreshMarks();
    }, 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getPositions(): Promise<Record<string, unknown>[]> {
    await this.refreshMarks();
    return this.sim.getPredictionPositions();
  }

  getOrders(slug?: string): Record<string, unknown>[] {
    return this.sim.getPredictionOrders(slug);
  }

  async placeOrder(input: PredictionOrderInput): Promise<Record<string, unknown>> {
    const market = await this.resolveMarket(input.slug);
    if (input.action === 'buy' && market.closed) {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '该预测市场已结束，不能继续买入');
    }
    return this.sim.placePredictionOrder(input, market);
  }

  async closePosition(
    positionId: string,
    qty?: string | number,
  ): Promise<Record<string, unknown>> {
    const position = this.sim.getPredictionPosition(positionId);
    if (!position) {
      throw new SimulationError(SIM_ERROR.POSITION_NOT_FOUND, '预测持仓不存在');
    }
    const market = await this.resolveMarket(position.slug);
    return this.sim.closePredictionPosition(positionId, qty, market);
  }

  // 定时刷新所有预测持仓的最新概率，让账户权益和浮动盈亏保持更新
  private async refreshMarks(): Promise<void> {
    if (this.refreshing) return;
    const slugs = this.sim.getOpenPredictionSlugs();
    if (!slugs.length) return;

    this.refreshing = true;
    try {
      const marks: Record<string, PredictionMarketSnapshot> = {};
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            marks[slug] = await this.resolveMarket(slug);
          } catch (error) {
            this.logger.warn(`刷新预测行情失败 ${slug}: ${(error as Error).message}`);
          }
        }),
      );
      if (Object.keys(marks).length) {
        this.sim.applyPredictionMarks(marks);
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async resolveMarket(slug: string): Promise<PredictionMarketSnapshot> {
    if (!slug) throw new SimulationError(SIM_ERROR.BAD_REQUEST, '预测市场不能为空');

    const detail = await this.polymarket.getMarketDetail(slug);
    if (!detail) {
      throw new SimulationError(SIM_ERROR.MARKET_UNAVAILABLE, '预测市场不存在或接口暂不可用');
    }

    const market = detail.market;
    const yes = market.outcomes.find((outcome) => outcome.name.toLowerCase() === 'yes')
      ?? market.outcomes[0];
    const no = market.outcomes.find((outcome) => outcome.name.toLowerCase() === 'no')
      ?? market.outcomes[1];

    return {
      slug: market.slug,
      marketId: market.id,
      question: market.question,
      eventTitle: market.eventTitle,
      icon: market.icon,
      yesPrice: market.yesPrice,
      noPrice: market.noPrice ?? Math.max(0, 1 - market.yesPrice),
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      yesName: yes?.name || 'Yes',
      noName: no?.name || 'No',
      yesTokenId: yes?.tokenId || '',
      noTokenId: no?.tokenId || '',
      closed: market.closed,
      ts: Date.now(),
    };
  }
}
