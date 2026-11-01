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

  async getAccountConfig(account: OkxAccount) {
    return this.request(account, 'GET', '/api/v5/account/config');
  }

  async placeOrder(
    account: OkxAccount,
    body: {
      instId: string;
      tdMode: string;
      side: 'buy' | 'sell';
      posSide?: 'long' | 'short';
      ordType: 'market' | 'limit';
      sz: string;
      px?: string;
      clOrdId?: string;
      reduceOnly?: boolean;
    },
  ) {
    return this.request(account, 'POST', '/api/v5/trade/order', body);
  }

  async cancelOrder(account: OkxAccount, body: { instId: string; ordId?: string; clOrdId?: string }) {
    return this.request(account, 'POST', '/api/v5/trade/cancel-order', body);
  }

  async getOrder(account: OkxAccount, params: { instId: string; ordId?: string; clOrdId?: string }) {
    const query = new URLSearchParams();
    query.set('instId', params.instId);
    if (params.ordId) query.set('ordId', params.ordId);
    if (params.clOrdId) query.set('clOrdId', params.clOrdId);
    return this.request(account, 'GET', `/api/v5/trade/order?${query.toString()}`);
  }

  async getTicker(instId: string) {
    try {
      const res = await axios.get<{ code: string; data: any[] }>(`${OKX_BASE}/api/v5/market/ticker`, {
        params: { instId },
        timeout: 10000,
        httpsAgent: this.proxyAgent ?? undefined,
        proxy: false,
      });
      return res.data;
    } catch (error) {
      this.logger.warn(`OKX ticker 获取失败 ${instId}: ${(error as Error).message}`);
      return null;
    }
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
      this.logger.log(`响应: ${res.status} ${this.summary(res.data)}`);
      return res.data;
    } catch (err: any) {
      if (err.response) {
        const okxBody = err.response.data;
        const code = okxBody?.code;
        const msg = okxBody?.msg || okxBody?.data?.[0]?.msg || '';
        this.logger.error(`OKX API 错误 | 状态: ${err.response.status} | code: ${code ?? '-'} | msg: ${String(msg).slice(0, 200)}`);
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

  /** 只记录上游响应的状态和计数，禁止把完整响应/请求头写入日志。 */
  private summary(data: any): string {
    if (!data || typeof data !== 'object') return 'empty';
    const code = data.code ?? '-';
    const msg = String(data.msg || '').slice(0, 200);
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return `code=${code} msg=${msg || '-'} data=${count}`;
  }
}
