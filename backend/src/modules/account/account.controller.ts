// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

function generateEquityPoints(mode: string, days: number) {
  const now = Date.now();
  const msPerPoint = days <= 1 ? 60000 : days <= 7 ? 3600000 : 86400000;
  const count = days <= 1 ? 96 : days <= 7 ? 168 : Math.min(days, 365);
  const base = mode === 'simulation' ? 100000 : 105000;
  const volatility = mode === 'simulation' ? 0.003 : 0.005;
  let price = base;

  const points: { ts: number; equity: number }[] = [];

  for (let i = count; i >= 0; i--) {
    const drift = (Math.random() - 0.48) * volatility * base;
    price = price + drift;
    if (price < base * 0.7) price = base * 0.7;
    if (price > base * 1.5) price = base * 1.5;
    points.push({ ts: now - i * msPerPoint, equity: Math.round(price * 100) / 100 });
  }

  return points;
}

const RANGE_MAP: Record<string, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

// 账户管理控制器
@Controller('account')
export class AccountController {
  // 获取当前交易模式（模拟/实盘）
  @Get('mode')
  getMode() {
    return ok({ mode: 'simulation' });
  }

  // 切换交易模式
  @Put('mode')
  updateMode(@Body() body: { mode: 'simulation' | 'live' }) {
    return ok(body);
  }

  // 获取账户资产信息
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

  // 获取权益历史曲线
  @Get('equity-history')
  getEquityHistory(
    @Query('mode') mode = 'simulation',
    @Query('range') range = '30d',
  ) {
    if (mode === 'live') {
      return ok({ mode, range, points: [] });
    }
    const days = RANGE_MAP[range] || 30;
    const points = generateEquityPoints(mode, days);
    return ok({ mode, range, points });
  }

  // 获取账户流水记录
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

  // 重置模拟账户资金
  @Post('simulation/reset')
  resetSimulation(@Body() body: { confirm: boolean }) {
    return ok({
      reset: body.confirm,
      walletBalance: '100000.00',
    });
  }
}
