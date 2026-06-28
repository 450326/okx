import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';

@Controller('positions')
export class PositionsController {
  @Get()
  getPositions(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    const list = [
      {
        id: 'pos_1001',
        symbol: 'BTC-USDT-SWAP',
        side: 'long',
        leverage: 10,
        qty: '0.02',
        entryPrice: '64800',
        markPrice: '65000',
        lastPrice: '65005',
        notional: '1300.00',
        initialMargin: '130.00',
        maintenanceMargin: '6.50',
        liquidationPrice: '58450.2',
        unrealizedPnl: '4.00',
        roe: '0.0307',
        takeProfitPrice: '67000',
        stopLossPrice: '64000',
        status: 'open',
      },
      {
        id: 'pos_1002',
        symbol: 'ETH-USDT-SWAP',
        side: 'short',
        leverage: 5,
        qty: '0.50',
        entryPrice: '3460',
        markPrice: '3450',
        lastPrice: '3450.1',
        notional: '1725.00',
        initialMargin: '345.00',
        maintenanceMargin: '13.80',
        liquidationPrice: '3812.4',
        unrealizedPnl: '5.00',
        roe: '0.0145',
        takeProfitPrice: '3380',
        stopLossPrice: '3520',
        status: 'open',
      },
    ];

    return ok({
      mode,
      list: symbol ? list.filter((item) => item.symbol === symbol) : list,
    });
  }

  @Put(':id/risk')
  updateRisk(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({
      positionId: id,
      ...body,
    });
  }

  @Post(':id/close')
  closePosition(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({
      positionId: id,
      status: 'closed',
      payload: body,
    });
  }
}
