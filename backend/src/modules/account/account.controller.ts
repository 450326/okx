import { Body, Controller, Get, Headers, Logger, Post, Put, Query } from '@nestjs/common';
import { fail, ok } from '../../common/api-response';
import { ERROR_CODES } from '../../common/error-codes';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';
import { AccountModeService, ModeTransitionError } from './account-mode.service';
import { CapabilityService } from './capability.service';
import { SimulationState } from '../simulation/simulation-state';

@Controller('account')
export class AccountController {
  private readonly logger = new Logger(AccountController.name);

  constructor(
    private readonly okxApi: OkxApiService,
    private readonly accountStore: AccountStore,
    private readonly modeService: AccountModeService,
    private readonly capabilityService: CapabilityService,
    private readonly sim: SimulationState,
  ) {}

  @Get('mode')
  async getMode(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    return ok(await this.modeService.getView(authorization, overlay));
  }

  @Put('mode')
  async updateMode(
    @Body() body: { mode?: string; reason?: string },
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    try {
      return ok(await this.modeService.changeMode(body, authorization, overlay));
    } catch (error) {
      if (error instanceof ModeTransitionError) {
        return fail(error.message, error.code, { blockers: error.blockers });
      }
      throw error;
    }
  }

  @Get('assets')
  async getAssets(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const matrix = this.capabilityService.getMatrix(authorization, overlay);
    if (matrix.state === 'simulation') {
      return ok({ ...(await this.sim.getAccountSnapshot()), source: 'simulation' });
    }

    this.capabilityService.assert('futuresPositions', authorization, overlay);
    const account = this.accountStore.getActiveOkx();
    if (!account) {
      return fail('未找到已激活的 OKX API 账户，请先在资产页绑定并测试连接', ERROR_CODES.LIVE_ACCOUNT_REQUIRED);
    }

    this.logger.log(`获取实盘余额: ${account.label}`);
    const data = await this.okxApi.getBalance(account);
    this.logger.log(
      `OKX 余额响应: code=${data?.code ?? '-'} data=${Array.isArray(data?.data) ? data.data.length : 0}`,
    );

    if (!data) {
      this.logger.error('OKX API 请求失败，返回 null');
      return fail('OKX API 请求失败，请检查网络或代理配置', ERROR_CODES.UPSTREAM_ERROR);
    }

    if (data.code !== '0') {
      const errMsg = data.msg || '未知错误';
      this.logger.error(`OKX 返回错误: code=${data.code} msg=${errMsg}`);
      return fail(`OKX API 返回错误: ${errMsg}`, ERROR_CODES.UPSTREAM_ERROR);
    }

    if (!data.data?.length) {
      this.logger.warn('OKX 返回数据为空（无资产）');
      return fail('OKX 返回数据为空，请确认当前账户有资产', ERROR_CODES.LIVE_DATA_UNAVAILABLE);
    }

    const bal = data.data[0];
    const usdt = bal.details?.find((d: any) => d.ccy === 'USDT');

    if (!usdt) {
      this.logger.warn('当前账户无 USDT 余额');
      return fail('当前账户无 USDT 余额', ERROR_CODES.LIVE_DATA_UNAVAILABLE);
    }

    const eq = Number(usdt.eq) || 0;
    const avail = Number(usdt.availBal) || 0;
    const frozen = Number(usdt.frozenBal) || 0;

    this.logger.log(`实盘余额解析成功: equity=${eq} avail=${avail}`);
    return ok({
      mode: 'live',
      source: 'okx',
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

  @Get('equity-history')
  getEquityHistory(
    @Query('range') range = '30d',
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilityService.assert('equityHistory', authorization, overlay);
    return ok({ mode: 'simulation', source: 'simulation', range, points: this.sim.getEquityHistory(range) });
  }

  @Get('ledger')
  getLedger(
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    const capability = this.capabilityService.assert('ledger', authorization, overlay);
    return ok({ mode: 'simulation', source: capability.source, list: this.sim.getLedger('simulation') });
  }

  @Post('simulation/reset')
  resetSimulation(
    @Body() body: { confirm: boolean },
    @Headers('authorization') authorization?: string,
    @Headers('x-simulation-overlay') overlay?: string,
  ) {
    this.capabilityService.assert('simulationReset', authorization, overlay);
    if (!body?.confirm) {
      return fail('请确认重置模拟账户', ERROR_CODES.CONFIRM_REQUIRED);
    }
    return ok({ reset: true, ...this.sim.reset() });
  }
}
