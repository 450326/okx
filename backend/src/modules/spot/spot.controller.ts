import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { MarketService } from '../market/market.service';
import { SimulationState } from '../simulation/simulation-state';
import type { SpotTradeInput } from '../simulation/simulation.types';

// 现货行情 + 现货模拟交易
@Controller('spot')
export class SpotController {
  constructor(
    private readonly market: MarketService,
    private readonly sim: SimulationState,
  ) {}

  @Get('markets')
  async getMarkets(@Query('exchange') exchange = 'okx') {
    const list = await this.market.getSpotSymbols(exchange);
    return ok({ exchange, list });
  }

  @Get('tickers')
  async getTickers(
    @Query('symbols') symbols?: string,
    @Query('exchange') exchange = 'okx',
  ) {
    const list = await this.market.getSpotTickers(
      symbols?.split(',').filter(Boolean),
      exchange,
    );
    return ok({ exchange, list });
  }

  @Get('klines')
  async getKlines(
    @Query('symbol') symbol = 'BTC-USDT',
    @Query('interval') interval = '5m',
    @Query('exchange') exchange = 'okx',
    @Query('limit') limit?: string,
  ) {
    const list = await this.market.getSpotKlines(
      symbol,
      interval,
      exchange,
      this.parseLimit(limit),
    );
    return ok({ symbol, interval, list });
  }

  @Get('holdings')
  async getHoldings() {
    const list = await this.sim.getSpotHoldings();
    return ok({ mode: 'simulation', list });
  }

  @Get('orders')
  getOrders(@Query('symbol') symbol?: string) {
    return ok({ mode: 'simulation', list: this.sim.getSpotOrders(symbol) });
  }

  @Post('orders')
  async placeOrder(@Body() body: SpotTradeInput) {
    return ok(await this.sim.placeSpotOrder(body));
  }

  private parseLimit(value?: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1000;
  }
}
