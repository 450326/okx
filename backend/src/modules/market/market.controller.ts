import { Controller, Get, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('symbols')
  async getSymbols(@Query('exchange') exchange = 'okx') {
    const list = await this.marketService.getSymbols(exchange);
    return ok({ list });
  }

  @Get('tickers')
  async getTickers(@Query('symbols') symbols?: string, @Query('exchange') exchange = 'okx') {
    const requestedSymbols = symbols?.split(',').filter(Boolean);
    const list = await this.marketService.getTickers(requestedSymbols, exchange);
    return ok({ list });
  }

  @Get('klines')
  async getKlines(
    @Query('symbol') symbol = 'BTC-USDT-SWAP',
    @Query('interval') interval = '5m',
    @Query('exchange') exchange = 'okx',
  ) {
    const list = await this.marketService.getKlines(symbol, interval, exchange);
    return ok({ symbol, interval, list });
  }

  @Get('depth')
  async getDepth(@Query('symbol') symbol = 'BTC-USDT-SWAP', @Query('exchange') exchange = 'okx') {
    const result = await this.marketService.getDepth(symbol, 20, exchange);
    if (result) return ok(result);
    return ok({ symbol, bids: [], asks: [] });
  }

  @Get('trades')
  async getTrades(@Query('symbol') symbol = 'BTC-USDT-SWAP', @Query('exchange') exchange = 'okx') {
    const list = await this.marketService.getTrades(symbol, exchange);
    return ok({ symbol, list });
  }
}
