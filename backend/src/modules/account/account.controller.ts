import { Body, Controller, Get, HttpException, HttpStatus, Post, Put, Query, Logger } from '@nestjs/common';
import { ok, fail } from '../../common/api-response';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';

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

@Controller('account')
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    private readonly okxApi: OkxApiService,
    private readonly accountStore: AccountStore,
  ) {}

  @Get('mode')
  getMode() {
    return ok({ mode: 'simulation' });
  }

  @Put('mode')
  updateMode(@Body() body: { mode: 'simulation' | 'live' }) {
    return ok(body);
  }

  @Get('assets')
  async getAssets(@Query('mode') mode = 'simulation') {
    if (mode === 'live') {
      const account = this.accountStore.getActiveOkx();
      if (!account) {
        this.logger.warn('实盘余额查询：未找到已激活的 OKX API 账户');
        return fail('未找到已激活的 OKX API 账户，请先在资产页绑定并测试连接');
      }

      this.logger.log(`获取实盘余额: ${account.label}`);
      const data = await this.okxApi.getBalance(account);
      this.logger.log(`OKX 响应: ${JSON.stringify(data).slice(0, 500)}`);

      if (!data) {
        this.logger.error('OKX API 请求失败，返回 null');
        return fail('OKX API 请求失败，请检查网络或代理配置');
      }

      if (data.code !== '0') {
        const errMsg = data.msg || '未知错误';
        this.logger.error(`OKX 返回错误: code=${data.code} msg=${errMsg}`);
        return fail(`OKX API 返回错误: ${errMsg}`);
      }

      if (!data.data?.length) {
        this.logger.warn('OKX 返回数据为空（无资产）');
        return fail('OKX 返回数据为空，请确认当前账户有资产');
      }

      const bal = data.data[0];
      const usdt = bal.details?.find((d: any) => d.ccy === 'USDT');

      if (!usdt) {
        this.logger.warn('当前账户无 USDT 余额');
        return fail('当前账户无 USDT 余额');
      }

      const eq = Number(usdt.eq) || 0;
      const avail = Number(usdt.availBal) || 0;
      const frozen = Number(usdt.frozenBal) || 0;

      this.logger.log(`实盘余额解析成功: equity=${eq} avail=${avail}`);
      return ok({
        mode,
        currency: 'USDT',
        walletBalance: String(eq),
        availableBalance: String(avail),
        positionMargin: String(frozen),
        orderMargin: '0',
        unrealizedPnl: '0',
        realizedPnl: '0',
        equity: String(eq),
      });
    }

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
