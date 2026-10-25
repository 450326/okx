import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import {
  SIM_ERROR,
  SimulationError,
  SimulationOrderInput,
} from '../simulation/simulation.types';

@Controller('orders')
export class OrdersController {
  constructor(private readonly sim: SimulationState) {}

  @Post('preview')
  async preview(@Body() body: SimulationOrderInput) {
    return ok(await this.sim.previewOrder(body));
  }

  @Post()
  async createOrder(@Body() body: SimulationOrderInput) {
    return ok(await this.sim.placeOrder(body));
  }

  @Get('open')
  getOpenOrders(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    if (mode !== 'simulation') return ok({ mode, list: [] });
    return ok({ mode, list: this.sim.getOpenOrders(symbol) });
  }

  @Get('history')
  getOrderHistory(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    if (mode !== 'simulation') return ok({ mode, list: [] });
    return ok({ mode, list: this.sim.getHistoryOrders(symbol) });
  }

  @Get('fills')
  getFills(@Query('mode') mode = 'simulation') {
    if (mode !== 'simulation') return ok({ mode, list: [] });
    return ok({ mode, list: this.sim.getFills() });
  }

  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @Body() body?: { mode?: string }) {
    if (body?.mode && body.mode !== 'simulation') {
      throw new SimulationError(SIM_ERROR.BAD_REQUEST, '实盘订单请走实盘交易适配器，模拟盘不可撤实盘单');
    }
    return ok(this.sim.cancelOrder(id));
  }
}
