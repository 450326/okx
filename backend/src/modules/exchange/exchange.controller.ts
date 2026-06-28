import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ok } from '../../common/api-response';

interface StoredAccount {
  id: string;
  exchange: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  isTestnet: boolean;
  status: string;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

const accounts = new Map<string, StoredAccount>();
let nextId = 1;

@Controller('exchange-accounts')
export class ExchangeController {
  @Get()
  getAccounts() {
    const list = Array.from(accounts.values()).map((a) => ({
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
  createAccount(
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
    const id = `ex_${String(nextId++).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const account: StoredAccount = {
      id,
      exchange: body.exchange || 'okx',
      label: body.label,
      apiKey: body.apiKey,
      apiSecret: body.apiSecret,
      passphrase: body.passphrase,
      isTestnet: body.isTestnet ?? false,
      status: 'active',
      lastTestAt: null,
      lastSyncAt: null,
      createdAt: now,
    };
    accounts.set(id, account);

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
  testAccount(@Param('id') id: string) {
    const account = accounts.get(id);
    if (!account) {
      return ok({ id, connected: false, error: '账户不存在' });
    }
    account.lastTestAt = new Date().toISOString();
    account.status = 'active';
    return ok({ id, connected: true });
  }

  @Delete(':id')
  deleteAccount(@Param('id') id: string) {
    const existed = accounts.has(id);
    accounts.delete(id);
    return ok({ id, deleted: existed });
  }
}
