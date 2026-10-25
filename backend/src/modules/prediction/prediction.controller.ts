import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import type { PredictionOrderInput } from '../simulation/simulation.types';
import { PolymarketService } from './polymarket.service';
import { PredictionTradingService } from './prediction-trading.service';

// 预测市场控制器：独立于合约行情 /market，使用 /prediction 前缀
@Controller('prediction')
export class PredictionController {
  constructor(
    private readonly polymarketService: PolymarketService,
    private readonly trading: PredictionTradingService,
  ) {}

  // 市场列表：支持分页、排序和关键词搜索
  @Get('markets')
  async getMarkets(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sort') sort?: string,
    @Query('keyword') keyword?: string,
  ) {
    const result = await this.polymarketService.listMarkets({
      limit: this.toInt(limit, 24),
      offset: this.toInt(offset, 0),
      sort,
      keyword,
    });
    return ok(result);
  }

  // 市场详情：问题、概率、盘口摘要、相关市场
  @Get('markets/:slug')
  async getMarket(@Param('slug') slug: string) {
    const detail = await this.polymarketService.getMarketDetail(slug);
    if (!detail) throw new NotFoundException('预测市场不存在');
    return ok(detail);
  }

  // YES 概率走势
  @Get('markets/:slug/history')
  async getHistory(@Param('slug') slug: string, @Query('interval') interval = '1w') {
    const history = await this.polymarketService.getHistory(slug, interval);
    if (!history) throw new NotFoundException('预测市场不存在');
    return ok(history);
  }

  // YES 代币订单簿
  @Get('markets/:slug/orderbook')
  async getOrderBook(@Param('slug') slug: string, @Query('depth') depth?: string) {
    const book = await this.polymarketService.getOrderBook(slug, this.toInt(depth, 20));
    if (!book) throw new NotFoundException('预测市场不存在');
    return ok(book);
  }

  // 最近成交
  @Get('markets/:slug/trades')
  async getTrades(@Param('slug') slug: string, @Query('limit') limit?: string) {
    const trades = await this.polymarketService.getTrades(slug, this.toInt(limit, 50));
    if (trades === null) {
      throw new NotFoundException('预测市场不存在');
    }
    return ok({ slug, list: trades });
  }

  // ---- 模拟交易（与合约模拟盘共用同一份钱包）----

  // 当前预测持仓
  @Get('positions')
  async getPositions() {
    const list = await this.trading.getPositions();
    return ok({ mode: 'simulation', list });
  }

  // 预测成交记录
  @Get('orders')
  getOrders(@Query('slug') slug?: string) {
    return ok({ mode: 'simulation', list: this.trading.getOrders(slug) });
  }

  // 买入/卖出预测份额（市价成交）
  @Post('orders')
  async placeOrder(@Body() body: PredictionOrderInput) {
    return ok(await this.trading.placeOrder(body));
  }

  // 按持仓 id 平仓（qty 不传表示全部卖出）
  @Post('positions/:id/close')
  async closePosition(@Param('id') id: string, @Body() body: { qty?: string }) {
    return ok(await this.trading.closePosition(id, body?.qty));
  }

  // 把查询参数安全地转成整数，非法输入回退到默认值
  private toInt(value: string | undefined, fallback: number): number {
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
}
