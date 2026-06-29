// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

// 持仓管理控制器
@Controller('positions')
export class PositionsController {
  // 获取当前持仓列表
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

  // 更新持仓风控参数（止盈止损）
  @Put(':id/risk')
  updateRisk(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({
      positionId: id,
      ...body,
    });
  }

  // 平仓指定持仓
  @Post(':id/close')
  closePosition(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({
      positionId: id,
      status: 'closed',
      payload: body,
    });
  }
}
