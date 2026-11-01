import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { MarketService } from '../market/market.service';
import { SimulationState } from '../simulation/simulation-state';
import type { SpotTradeInput } from '../simulation/simulation.types';
import { CapabilityService } from '../account/capability.service';

// 现货行情 + 现货模拟交易
@Controller('spot')
export class SpotController {
  constructor(
    private readonly market: MarketService,
    private readonly sim: SimulationState,
    private readonly capabilities: CapabilityService,
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
  async getHoldings(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('spotHoldings', authorization, overlay);
    const matrix = this.capabilities.getMatrix(authorization, overlay);
    const list = await this.sim.getSpotHoldings();
    return ok({
      mode: matrix.state === 'simulation' ? 'simulation' : 'live',
      source: capability.source,
      overlay: matrix.overlayEnabled,
      list,
    });
  }

  @Get('orders')
  getOrders(
    @Query('symbol') symbol?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('spotHoldings', authorization, overlay);
    const matrix = this.capabilities.getMatrix(authorization, overlay);
    return ok({
      mode: matrix.state === 'simulation' ? 'simulation' : 'live',
      source: capability.source,
      overlay: matrix.overlayEnabled,
      list: this.sim.getSpotOrders(symbol),
    });
  }

  @Post('orders')
  async placeOrder(
    @Body() body: SpotTradeInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('spotTrade', authorization, overlay);
    return ok(await this.sim.placeSpotOrder(body));
  }

  private parseLimit(value?: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1000;
  }
}
