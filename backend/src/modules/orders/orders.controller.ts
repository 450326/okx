import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import {
  SimulationOrderInput,
} from '../simulation/simulation.types';
import { CapabilityService } from '../account/capability.service';
import { LiveAccountService } from '../account/live-account.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly sim: SimulationState,
    private readonly capabilities: CapabilityService,
    private readonly live: LiveAccountService,
  ) {}

  @Post('preview')
  async preview(
    @Body() body: SimulationOrderInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    return ok(await this.sim.previewOrder(body));
  }

  @Post()
  async createOrder(
    @Body() body: SimulationOrderInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    return ok(await this.sim.placeOrder(body));
  }

  @Get('open')
  async getOpenOrders(
    @Query('symbol') symbol?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('futuresOpenOrders', authorization, overlay);
    if (capability.source === 'okx') {
      return ok({ mode: 'live', source: 'okx', list: await this.live.getOpenOrders(symbol) });
    }
    return ok({ mode: 'simulation', source: 'simulation', list: this.sim.getOpenOrders(symbol) });
  }

  @Get('history')
  getOrderHistory(
    @Query('symbol') symbol?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresOrderHistory', authorization, overlay);
    return ok({ mode: 'simulation', source: 'simulation', list: this.sim.getHistoryOrders(symbol) });
  }

  @Get('fills')
  getFills(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresOrderHistory', authorization, overlay);
    return ok({ mode: 'simulation', source: 'simulation', list: this.sim.getFills() });
  }

  @Post(':id/cancel')
  cancelOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    return ok(this.sim.cancelOrder(id));
  }
}
