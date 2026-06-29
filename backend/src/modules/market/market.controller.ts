// 引入 NestJS 控制器相关装饰器
import { Controller, Get, Query } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';
// 引入行情数据服务
import { MarketService } from './market.service';

// 行情数据控制器
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  // 获取指定交易所支持的交易品种列表
  @Get('symbols')
  async getSymbols(@Query('exchange') exchange = 'okx') {
    const list = await this.marketService.getSymbols(exchange);
    return ok({ list });
  }

  // 获取行情 ticker 数据，支持按交易对过滤
  @Get('tickers')
  async getTickers(@Query('symbols') symbols?: string, @Query('exchange') exchange = 'okx') {
    const requestedSymbols = symbols?.split(',').filter(Boolean);
    const list = await this.marketService.getTickers(requestedSymbols, exchange);
    return ok({ list });
  }

  // 获取 K 线数据，支持指定周期和交易所
  @Get('klines')
  async getKlines(
    @Query('symbol') symbol = 'BTC-USDT-SWAP',
    @Query('interval') interval = '5m',
    @Query('exchange') exchange = 'okx',
  ) {
    const list = await this.marketService.getKlines(symbol, interval, exchange);
    return ok({ symbol, interval, list });
  }

  // 获取订单簿深度数据
  @Get('depth')
  async getDepth(@Query('symbol') symbol = 'BTC-USDT-SWAP', @Query('exchange') exchange = 'okx') {
    const result = await this.marketService.getDepth(symbol, 20, exchange);
    if (result) return ok(result);
    return ok({ symbol, bids: [], asks: [] });
  }

  // 获取最新成交记录
  @Get('trades')
  async getTrades(@Query('symbol') symbol = 'BTC-USDT-SWAP', @Query('exchange') exchange = 'okx') {
    const list = await this.marketService.getTrades(symbol, exchange);
    return ok({ symbol, list });
  }
}
