import { Body, Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import axios from 'axios';

const OKX_BASE = 'https://www.okx.com/api/v5';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly sim: SimulationState) {}

  @Post('preview')
  preview(@Body() body: { symbol: string; leverage: number; qty: string }) {
    return ok({
      ...body,
      estimatedNotional: '1300.00',
      estimatedMargin: '130.00',
      estimatedFee: '0.65',
      estimatedLiquidationPrice: '58450.2',
      maxQty: '1.250',
    });
  }

  @Post()
  async createOrder(
    @Body()
    body: {
      symbol: string;
      side: 'long' | 'short';
      action: 'open' | 'close';
      orderType: 'market' | 'limit';
      qty: string;
      leverage: number;
      price?: string | null;
      takeProfitPrice?: string;
      stopLossPrice?: string;
    },
  ) {
    let fillPrice: string | undefined;

    if (body.orderType === 'market') {
      fillPrice = await this.fetchMarkPrice(body.symbol);
      this.logger.log(`市价单使用成交价: ${fillPrice}`);
    }

    const result = this.sim.addOrder(body, fillPrice);
    return ok(result);
  }

  @Get('open')
  getOpenOrders(@Query('mode') _mode = 'simulation', @Query('symbol') symbol?: string) {
    return ok({ list: this.sim.getPendingOrders(symbol) });
  }

  @Get('history')
  getOrderHistory(@Query('mode') _mode = 'simulation', @Query('symbol') symbol?: string) {
    return ok({ list: this.sim.getHistoryOrders(symbol) });
  }

  @Get('fills')
  getFills(@Query('mode') _mode = 'simulation') {
    const list = this.sim.getAllOrders()
      .filter((o) => o.status === 'filled')
      .map((o) => ({
        fillId: `fill_${o.orderId}`,
        orderId: o.orderId,
        symbol: o.symbol,
        fillPrice: o.avgFillPrice || '0',
        fillQty: o.qty,
        fee: o.fee || '0',
        liquidity: 'taker',
      }));
    return ok({ list });
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    const ok2 = this.sim.cancelOrder(id);
    return ok({ orderId: id, status: ok2 ? 'cancelled' : 'not_found' });
  }

  private async fetchMarkPrice(symbol: string): Promise<string> {
    try {
      const instId = symbol.replace('-SWAP', '-USDT-SWAP');
      const res = await axios.get(`${OKX_BASE}/market/ticker`, {
        params: { instId },
        timeout: 5000,
      });
      const last = res.data?.data?.[0]?.last;
      if (last) return last;
    } catch {
      this.logger.warn(`获取市价失败，使用默认价格`);
    }
    const fallbacks: Record<string, string> = {
      'BTC-USDT-SWAP': '65000',
      'ETH-USDT-SWAP': '3450',
    };
    return fallbacks[symbol] || '100';
  }
}
