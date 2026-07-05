import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

const { HttpsProxyAgent } = require('https-proxy-agent');

const OKX_BASE = 'https://www.okx.com';
const OKX_DEMO_BASE = 'https://www.okx.com';

interface OkxAccount {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  isTestnet?: boolean;
}

@Injectable()
export class OkxApiService {
  private readonly logger = new Logger(OkxApiService.name);
  private proxyAgent: any = null;

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    if (proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      this.logger.log(`OkxApiService 使用代理: ${proxyUrl}`);
    }
  }

  private headers(account: OkxAccount, method: string, path: string, body?: any) {
    const timestamp = new Date().toISOString();
    const prehash = `${timestamp}${method}${path}${body ? JSON.stringify(body) : ''}`;
    const sig = crypto.createHmac('sha256', account.apiSecret).update(prehash).digest('base64');
    const hdrs: Record<string, string> = {
      'OK-ACCESS-KEY': account.apiKey,
      'OK-ACCESS-SIGN': sig,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': account.passphrase,
      'Content-Type': 'application/json',
    };
    if (account.isTestnet) {
      hdrs['x-simulated-trading'] = '1';
    }
    return hdrs;
  }

  private baseUrl(isTestnet?: boolean): string {
    if (isTestnet) {
      this.logger.log('使用 OKX 模拟交易环境 (isTestnet=true)');
      return OKX_DEMO_BASE;
    }
    return OKX_BASE;
  }

  async getBalance(account: OkxAccount) {
    return this.request(account, 'GET', '/api/v5/account/balance');
  }

  async getPositions(account: OkxAccount, instType = 'SWAP') {
    return this.request(account, 'GET', `/api/v5/account/positions?instType=${instType}`);
  }

  async getPendingOrders(account: OkxAccount, instId?: string) {
    let path = '/api/v5/trade/orders-pending';
    if (instId) path += `?instId=${instId}`;
    return this.request(account, 'GET', path);
  }

  private async request(account: OkxAccount, method: string, path: string, body?: any) {
    const url = `${this.baseUrl(account.isTestnet)}${path}`;
    const hdrs = this.headers(account, method, path, body);
    this.logger.log(`[${account.isTestnet ? '模拟' : '实盘'}] 请求: ${method} ${url}`);

    try {
      const res = await axios({
        method: method.toLowerCase() as any,
        url,
        headers: hdrs,
        data: body,
        timeout: 10000,
        httpsAgent: this.proxyAgent ?? undefined,
        proxy: false,
      });
      this.logger.log(`响应: ${res.status} ${JSON.stringify(res.data).slice(0, 500)}`);
      return res.data;
    } catch (err: any) {
      if (err.response) {
        const okxBody = err.response.data;
        this.logger.error(`OKX API 错误 | 状态: ${err.response.status} | 响应: ${JSON.stringify(okxBody)}`);
        if (okxBody && okxBody.code !== undefined) {
          return okxBody;
        }
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        this.logger.error(`OKX 连接失败 (${err.code})，检查代理或网络`);
      } else {
        this.logger.error(`OKX 请求异常: ${err.message}`);
      }
      return null;
    }
  }
}
