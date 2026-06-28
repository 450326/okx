import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';

@Controller('orders')
export class OrdersController {
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
  createOrder(@Body() body: Record<string, unknown>) {
    return ok({
      orderId: 'ord_1001',
      status: 'filled',
      payload: body,
    });
  }

  @Get('open')
  getOpenOrders(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    const list = [
      {
        orderId: 'ord_1001',
        symbol: 'BTC-USDT-SWAP',
        side: 'long',
        action: 'open',
        status: 'pending',
        orderType: 'limit',
        price: '64750',
        qty: '0.03',
      },
      {
        orderId: 'ord_1002',
        symbol: 'ETH-USDT-SWAP',
        side: 'short',
        action: 'open',
        status: 'pending',
        orderType: 'limit',
        price: '3465',
        qty: '0.50',
      },
    ];

    return ok({
      mode,
      list: symbol ? list.filter((item) => item.symbol === symbol) : list,
    });
  }

  @Get('history')
  getOrderHistory(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    const list = [
      {
        orderId: 'ord_1001',
        symbol: 'BTC-USDT-SWAP',
        side: 'long',
        action: 'open',
        orderType: 'market',
        avgFillPrice: '65000.2',
        qty: '0.02',
        fee: '0.65',
        status: 'filled',
      },
      {
        orderId: 'ord_1002',
        symbol: 'ETH-USDT-SWAP',
        side: 'short',
        action: 'close',
        orderType: 'limit',
        price: '3445',
        avgFillPrice: '3445',
        qty: '0.50',
        fee: '0.86',
        status: 'filled',
      },
    ];

    return ok({
      mode,
      list: symbol ? list.filter((item) => item.symbol === symbol) : list,
    });
  }

  @Get('fills')
  getFills(@Query('mode') mode = 'simulation') {
    return ok({
      mode,
      list: [
        {
          fillId: 'fill_1001',
          orderId: 'ord_1001',
          symbol: 'BTC-USDT-SWAP',
          fillPrice: '65000.2',
          fillQty: '0.02',
          fee: '0.65',
          liquidity: 'taker',
        },
      ],
    });
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string) {
    return ok({
      orderId: id,
      status: 'cancelled',
    });
  }
}
