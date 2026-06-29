// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

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
