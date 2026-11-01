import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import { SIM_ERROR, SimulationError, SimulationOrderInput } from '../simulation/simulation.types';
import { CapabilityService } from '../account/capability.service';
import { LiveAccountService } from '../account/live-account.service';
import { LiveTradingService } from '../account/live-trading.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly sim: SimulationState,
    private readonly capabilities: CapabilityService,
    private readonly live: LiveAccountService,
    private readonly liveTrading: LiveTradingService,
  ) {}

  @Post('preview')
  async preview(
    @Body() body: SimulationOrderInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('futuresTrade', authorization, overlay);
    if (capability.source === 'okx') {
      return ok(await this.liveTrading.preview(body));
    }
    return ok(await this.sim.previewOrder(body));
  }

  @Post()
  async createOrder(
    @Body() body: SimulationOrderInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('futuresTrade', authorization, overlay);
    if (capability.source === 'okx') {
      return ok(await this.liveTrading.place(body));
    }
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

  @Get('live')
  getLiveOrders(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresOpenOrders', authorization, overlay);
    return ok({ mode: 'live', source: 'okx', list: this.liveTrading.listOrders() });
  }

  @Get('live/:clientOrderId')
  async syncLiveOrder(
    @Param('clientOrderId') clientOrderId: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresOpenOrders', authorization, overlay);
    return ok(await this.liveTrading.sync(clientOrderId));
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
  async cancelOrder(
    @Param('id') id: string,
    @Body() body: { symbol?: string } = {},
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('futuresTrade', authorization, overlay);
    if (capability.source === 'okx') {
      return ok(await this.liveTrading.cancel(id, body?.symbol));
    }
    try {
      return ok(this.sim.cancelOrder(id));
    } catch (error) {
      if (error instanceof SimulationError && error.code === SIM_ERROR.ORDER_NOT_FOUND) {
        throw new ForbiddenException('无权访问该订单');
      }
      throw error;
    }
  }
}
