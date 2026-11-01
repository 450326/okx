import { Body, Controller, Delete, ForbiddenException, Get, Logger, Param, Post } from '@nestjs/common';
import * as crypto from 'crypto';
import { ok } from '../../common/api-response';
import { AccountStore, StoredAccount } from '../account/account-store';
import { OkxApiService } from '../account/okx-api.service';
import { RequestContextService } from '../auth/request-context.service';

@Controller('exchange-accounts')
export class ExchangeController {
  private readonly logger = new Logger(ExchangeController.name);

  constructor(
    private readonly accountStore: AccountStore,
    private readonly okxApi: OkxApiService,
    private readonly context: RequestContextService,
  ) {}

  @Get()
  getAccounts() {
    const list = this.accountStore.getAll().map((a) => ({
      id: a.id,
      exchange: a.exchange,
      label: a.label,
      isTestnet: a.isTestnet,
      status: a.status,
      lastTestAt: a.lastTestAt,
      lastSyncAt: a.lastSyncAt,
    }));
    return ok({ list });
  }

  @Post()
  async createAccount(
    @Body()
    body: {
      exchange: string;
      label: string;
      apiKey: string;
      apiSecret: string;
      passphrase: string;
      isTestnet: boolean;
    },
  ) {
    const id = `ex_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    const account: StoredAccount = {
      id,
      userId: this.context.userId(),
      exchange: body.exchange || 'okx',
      label: body.label,
      apiKey: body.apiKey,
      apiSecret: body.apiSecret,
      passphrase: body.passphrase,
      isTestnet: body.isTestnet ?? false,
      status: 'pending',
      lastTestAt: null,
      lastSyncAt: null,
      createdAt: now,
    };

    this.logger.log(`校验 OKX API 账户: ${account.label}`);
    const result = await this.okxApi.getBalance({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      passphrase: account.passphrase,
      isTestnet: account.isTestnet,
    });

    if (result && result.code === '0' && result.data?.length) {
      account.status = 'active';
      account.lastTestAt = now;
      this.logger.log(`OKX 账户校验通过: ${account.label}`);
    } else {
      const errMsg = result?.msg || result?.data?.[0]?.msg || 'API 校验失败，请检查 Key / Secret / Passphrase';
      account.status = 'error';
      account.lastTestAt = now;
      this.logger.error(`OKX 账户校验失败: ${account.label} - ${errMsg}`);
    }

    this.accountStore.set(id, account);

    return ok({
      id: account.id,
      exchange: account.exchange,
      label: account.label,
      isTestnet: account.isTestnet,
      status: account.status,
      lastTestAt: account.lastTestAt,
      lastSyncAt: account.lastSyncAt,
    });
  }

  @Post(':id/test')
  async testAccount(@Param('id') id: string) {
    const account = this.accountStore.get(id);
    if (!account) {
      return ok({ id, connected: false, error: '账户不存在' });
    }

    const now = new Date().toISOString();
    this.logger.log(`测试连接 OKX API 账户: ${account.label}`);

    const result = await this.okxApi.getBalance({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      passphrase: account.passphrase,
      isTestnet: account.isTestnet,
    });

    if (result && result.code === '0' && result.data?.length) {
      account.status = 'active';
      account.lastTestAt = now;
      this.accountStore.set(id, account);
      this.logger.log(`测试连接通过: ${account.label}`);
      return ok({ id, connected: true, lastTestAt: now });
    }

    const errMsg = result?.msg || result?.data?.[0]?.msg || '连接测试失败';
    account.status = 'error';
    account.lastTestAt = now;
    this.accountStore.set(id, account);
    this.logger.error(`测试连接失败: ${account.label} - ${errMsg}`);
    return ok({ id, connected: false, error: errMsg, lastTestAt: now });
  }

  @Delete(':id')
  deleteAccount(@Param('id') id: string) {
    if (!this.accountStore.get(id)) {
      throw new ForbiddenException('无权删除该 API 账户');
    }
    this.accountStore.delete(id);
    return ok({ deleted: true });
  }
}
