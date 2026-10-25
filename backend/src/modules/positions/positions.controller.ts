import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';

@Controller('positions')
export class PositionsController {
  constructor(private readonly sim: SimulationState) {}

  @Get()
  async getPositions(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    if (mode !== 'simulation') return ok({ mode, list: [] });

    const list = await this.sim.getPositions();
    const filtered = symbol ? list.filter((item) => item.symbol === symbol) : list;
    return ok({ mode, list: filtered });
  }

  @Put(':id/risk')
  updateRisk(
    @Param('id') id: string,
    @Body() body: { takeProfitPrice?: string | null; stopLossPrice?: string | null },
  ) {
    return ok(this.sim.updatePositionRisk(id, body.takeProfitPrice, body.stopLossPrice));
  }

  @Post(':id/close')
  async closePosition(
    @Param('id') id: string,
    @Body() body: { qty?: string; symbol?: string },
  ) {
    const result = await this.sim.closePosition(id, body?.qty, body?.symbol);
    return ok(result);
  }
}
