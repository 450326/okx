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
  async getPositions(@Query('mode') mode = 'simulation', @Query('symbol') symbol?: string) {
    if (mode === 'live') return ok({ list: [] });

    const all = this.sim.getAllPositions();
    const list: any[] = [];
    for (const p of all) {
      if (symbol && p.symbol !== symbol) continue;

      let markPrice = '0';
      try {
        const res = await axios.get(`${OKX_BASE}/market/ticker`, {
          params: { instId: p.symbol },
          timeout: 3000,
        });
        const last = res.data?.data?.[0]?.last;
        if (last) markPrice = last;
      } catch {
        // ignore
      }

      const entry = Number(p.entryPrice);
      const mark = Number(markPrice);
      const qty = Number(p.qty);
      const pnl = p.side === 'long' ? (mark - entry) * qty : (entry - mark) * qty;
      const roe = entry ? ((mark - entry) / entry) * 100 * p.leverage : 0;

      list.push({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        leverage: p.leverage,
        qty: p.qty,
        entryPrice: p.entryPrice,
        createdAt: p.createdAt,
        markPrice,
        lastPrice: markPrice,
        notional: (qty * (mark || entry)).toFixed(2),
        initialMargin: ((qty * entry) / p.leverage).toFixed(2),
        maintenanceMargin: ((qty * entry) / p.leverage / 20).toFixed(2),
        liquidationPrice: '0',
        unrealizedPnl: pnl.toFixed(2),
        roe: roe.toFixed(2),
        status: 'open',
      });
    }

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
      const res = await axios.get(`${OKX_BASE}/market/ticker`, {
        params: { instId: sym },
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
