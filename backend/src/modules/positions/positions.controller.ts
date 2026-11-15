import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import { SIM_ERROR, SimulationError } from '../simulation/simulation.types';
import { CapabilityService } from '../account/capability.service';
import { LiveAccountService } from '../account/live-account.service';

@Controller('positions')
export class PositionsController {
  constructor(
    private readonly sim: SimulationState,
    private readonly capabilities: CapabilityService,
    private readonly live: LiveAccountService,
  ) {}

  @Get()
  async getPositions(
    @Query('symbol') symbol?: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilities.assert('futuresPositions', authorization, overlay);
    if (capability.source === 'okx') {
      return ok({ mode: 'live', source: 'okx', list: await this.live.getPositions(symbol) });
    }

    const list = await this.sim.getPositions();
    const filtered = symbol ? list.filter((item) => item.symbol === symbol) : list;
    return ok({ mode: 'simulation', source: 'simulation', list: filtered });
  }

  @Put(':id/risk')
  updateRisk(
    @Param('id') id: string,
    @Body() body: { takeProfitPrice?: string | null; stopLossPrice?: string | null },
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    try {
      return ok(this.sim.updatePositionRisk(id, body.takeProfitPrice, body.stopLossPrice));
    } catch (error) {
      if (error instanceof SimulationError && error.code === SIM_ERROR.POSITION_NOT_FOUND) {
        throw new ForbiddenException('无权访问该持仓');
      }
      throw error;
    }
  }

  @Post(':id/margin')
  addMargin(
    @Param('id') id: string,
    @Body() body: { amount?: string | number },
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    try {
      return ok(this.sim.addPositionMargin(id, body?.amount ?? 0));
    } catch (error) {
      if (error instanceof SimulationError && error.code === SIM_ERROR.POSITION_NOT_FOUND) {
        throw new ForbiddenException('无权访问该持仓');
      }
      throw error;
    }
  }

  @Post(':id/close')
  async closePosition(
    @Param('id') id: string,
    @Body() body: { qty?: string; symbol?: string },
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilities.assert('futuresTrade', authorization, overlay);
    try {
      const result = await this.sim.closePosition(id, body?.qty, body?.symbol);
      return ok(result);
    } catch (error) {
      if (error instanceof SimulationError && error.code === SIM_ERROR.POSITION_NOT_FOUND) {
        throw new ForbiddenException('无权访问该持仓');
      }
      throw error;
    }
  }
}
