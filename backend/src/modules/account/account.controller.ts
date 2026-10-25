import { Body, Controller, Get, Logger, Post, Put, Query } from '@nestjs/common';
import { fail, ok } from '../../common/api-response';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';
import { SimulationState } from '../simulation/simulation-state';

@Controller('account')
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    private readonly okxApi: OkxApiService,
    private readonly accountStore: AccountStore,
    private readonly sim: SimulationState,
  ) {}

  @Get('mode')
  getMode() {
    // 模式本身仍由前端保存；这里只保证模拟盘默认模式。
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

    return ok(await this.sim.getAccountSnapshot());
  }

  @Get('equity-history')
  getEquityHistory(@Query('mode') mode = 'simulation', @Query('range') range = '30d') {
    if (mode === 'live') {
      return ok({ mode, range, points: [] });
    }
    return ok({ mode, range, points: this.sim.getEquityHistory(range) });
  }

  @Get('ledger')
  getLedger(@Query('mode') mode = 'simulation') {
    return ok({ mode, list: this.sim.getLedger(mode) });
  }

  @Post('simulation/reset')
  resetSimulation(@Body() body: { confirm: boolean }) {
    if (!body?.confirm) {
      return fail('请确认重置模拟账户', 4001);
    }
    return ok({ reset: true, ...this.sim.reset() });
  }
}
