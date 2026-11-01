import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ok } from '../../common/api-response';
import { AccountCryptoService } from '../account/account-crypto.service';
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
    private readonly cryptoService: AccountCryptoService,
  ) {}

  @Get()
  getAccounts() {
    return ok({ list: this.accountStore.getAll().map((account) => this.accountStore.publicView(account)) });
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
    const apiKey = String(body?.apiKey || '').trim();
    const apiSecret = String(body?.apiSecret || '').trim();
    const passphrase = String(body?.passphrase || '').trim();
    if (!apiKey || !apiSecret || !passphrase) {
      throw new BadRequestException('API Key、Secret、Passphrase 均不能为空');
    }

    const id = `ex_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const exchange = body.exchange || 'okx';

    const account: StoredAccount = {
      id,
      userId: this.context.userId(),
      exchange,
      label: body.label || 'OKX',
      apiKey,
      apiSecret,
      passphrase,
      apiKeyMasked: this.cryptoService.mask(apiKey),
      apiKeyFingerprint: this.cryptoService.fingerprint(apiKey),
      permissions: [],
      isTestnet: body.isTestnet ?? false,
      status: 'pending',
      lastTestAt: null,
      lastSyncAt: null,
      createdAt: now,
    };

    this.logger.log(`校验 OKX API 账户: ${account.label}`);

    const credentials = { apiKey, apiSecret, passphrase, isTestnet: account.isTestnet };
    const result = await this.okxApi.getBalance(credentials);
    if (!result || result.code !== '0' || !result.data?.length) {
      const errMsg = result?.msg || result?.data?.[0]?.msg || 'API 校验失败，请检查 Key / Secret / Passphrase';
      this.logger.error(`OKX 账户校验失败: ${account.label} - ${errMsg}`);
      throw new BadRequestException(errMsg);
    }

    // 权限自检：有提币权限的 Key 拒绝绑定，避免把可提币凭证交给平台。
    const config = await this.okxApi.getAccountConfig(credentials);
    if (!config || config.code !== '0' || !config.data?.length) {
      this.logger.error(`OKX 账户权限读取失败: ${account.label}`);
      throw new BadRequestException('无法读取 API Key 权限，请确认 Key 具有读取账户配置的权限');
    }
    const permissions = String(config.data[0]?.perm || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (permissions.some((permission) => permission.includes('withdraw'))) {
      this.logger.error(`拒绝绑定具有提币权限的 API 账户: ${account.label}`);
      throw new BadRequestException('该 API Key 具有提币权限，请先在 OKX 取消提币权限后再绑定');
    }
    if (!permissions.length) {
      throw new BadRequestException('无法确认 API Key 权限，请检查 OKX 账户配置');
    }

    account.status = 'active';
    account.lastTestAt = now;
    account.permissions = permissions;
    this.accountStore.set(id, account);
    this.logger.log(`OKX 账户校验通过: ${account.label} (${permissions.join(',')})`);

    return ok(this.accountStore.publicView(account));
  }

  @Post(':id/test')
  async testAccount(@Param('id') id: string) {
    const account = this.accountStore.get(id);
    if (!account) {
      return ok({ id, connected: false, error: '账户不存在' });
    }

    const now = new Date().toISOString();
    this.logger.log(`测试连接 OKX API 账户: ${account.label}`);
    const credentials = {
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      passphrase: account.passphrase,
      isTestnet: account.isTestnet,
    };

    const result = await this.okxApi.getBalance(credentials);
    const config = result && result.code === '0' ? await this.okxApi.getAccountConfig(credentials) : null;
    const permissions = String(config?.data?.[0]?.perm || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const hasWithdraw = permissions.some((permission) => permission.includes('withdraw'));

    if (result && result.code === '0' && result.data?.length && config?.code === '0' && !hasWithdraw) {
      account.status = 'active';
      account.lastTestAt = now;
      account.permissions = permissions;
      this.accountStore.set(id, account);
      this.logger.log(`测试连接通过: ${account.label}`);
      return ok({ id, connected: true, lastTestAt: now, permissions });
    }

    const errMsg = hasWithdraw
      ? '该 API Key 具有提币权限，请先在 OKX 取消提币权限'
      : result?.msg || result?.data?.[0]?.msg || config?.msg || '连接测试失败';
    account.status = 'error';
    account.lastTestAt = now;
    account.permissions = permissions;
    this.accountStore.set(id, account);
    this.logger.error(`测试连接失败: ${account.label} - ${errMsg}`);
    return ok({ id, connected: false, error: errMsg, lastTestAt: now, permissions });
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
