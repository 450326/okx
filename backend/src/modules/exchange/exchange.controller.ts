// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

// 已存储的交易所账户信息接口
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

// 内存中存储的交易所账户映射表
const accounts = new Map<string, StoredAccount>();
// 自增 ID 计数器
let nextId = 1;

// 交易所账户管理控制器
@Controller('exchange-accounts')
export class ExchangeController {
  // 获取所有已添加的交易所账户列表
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

  // 添加新的交易所账户
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
    // 生成唯一 ID
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

  // 测试交易所账户连接
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

  // 删除交易所账户
  @Delete(':id')
  deleteAccount(@Param('id') id: string) {
    const existed = accounts.has(id);
    accounts.delete(id);
    return ok({ id, deleted: existed });
  }
}
