import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';

@Controller('account')
export class AccountController {
  @Get('mode')
  getMode() {
    return ok({ mode: 'simulation' });
  }

  @Put('mode')
  updateMode(@Body() body: { mode: 'simulation' | 'live' }) {
    return ok(body);
  }

  @Get('assets')
  getAssets(@Query('mode') mode = 'simulation') {
    return ok({
      mode,
      currency: 'USDT',
      walletBalance: '100000.00',
      availableBalance: '98200.15',
      positionMargin: '1500.00',
      orderMargin: '200.00',
      unrealizedPnl: '85.65',
      realizedPnl: '-12.30',
      equity: '100085.65',
    });
  }

  @Get('ledger')
  getLedger(@Query('mode') mode = 'simulation') {
    return ok({
      mode,
      list: [
        {
          id: 'ledger_1001',
          type: 'open_fee',
          amount: '-0.65',
          balanceAfter: '99999.35',
          symbol: 'BTC-USDT-SWAP',
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  @Post('simulation/reset')
  resetSimulation(@Body() body: { confirm: boolean }) {
    return ok({
      reset: body.confirm,
      walletBalance: '100000.00',
    });
  }
}
