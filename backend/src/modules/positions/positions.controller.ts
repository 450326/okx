import { Body, Controller, Get, Logger, Param, Post, Put, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { SimulationState } from '../simulation/simulation-state';
import axios from 'axios';

const OKX_BASE = 'https://www.okx.com/api/v5';

@Controller('positions')
export class PositionsController {
  private readonly logger = new Logger(PositionsController.name);

  constructor(private readonly sim: SimulationState) {}

  @Get()
  getPositions(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    if (mode === 'live') return ok({ list: [] });

    const all = this.sim.getAllPositions();
    let list = all.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      side: p.side,
      leverage: p.leverage,
      qty: p.qty,
      entryPrice: p.entryPrice,
      markPrice: '0',
      lastPrice: '0',
      notional: (Number(p.qty) * Number(p.entryPrice)).toFixed(2),
      initialMargin: ((Number(p.qty) * Number(p.entryPrice)) / p.leverage).toFixed(2),
      maintenanceMargin: ((Number(p.qty) * Number(p.entryPrice)) / p.leverage / 20).toFixed(2),
      liquidationPrice: '0',
      unrealizedPnl: '0',
      roe: '0',
      status: 'open',
    }));

    if (symbol) list = list.filter((p) => p.symbol === symbol);
    return ok({ list });
  }

  @Put(':id/risk')
  updateRisk(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return ok({ positionId: id, ...body });
  }

  @Post(':id/close')
  async closePosition(@Param('id') id: string, @Body() body: { symbol?: string; qty?: string }) {
    const sym = body.symbol;
    if (!sym) return ok({ positionId: id, status: 'closed', payload: body });

    let closePrice: string;
    try {
      const instId = sym.replace('-SWAP', '-USDT-SWAP');
      const res = await axios.get(`${OKX_BASE}/market/ticker`, {
        params: { instId },
        timeout: 5000,
      });
      closePrice = res.data?.data?.[0]?.last || (sym.includes('BTC') ? '65000' : '3450');
    } catch {
      closePrice = sym.includes('BTC') ? '65000' : '3450';
    }

    this.sim.closePosition(sym, closePrice);
    this.logger.log(`平仓: ${sym} @ ${closePrice}`);
    return ok({ positionId: id, status: 'closed', payload: body });
  }
}
