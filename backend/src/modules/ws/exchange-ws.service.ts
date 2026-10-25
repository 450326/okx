// 引入 NestJS 可注入和服务日志装饰器
import { Injectable, Logger } from '@nestjs/common';
// 引入 WebSocket 库（ws 是 CommonJS 导出，使用 import = require 避免默认导入在运行时变成 undefined）
import WebSocket = require('ws');
import * as crypto from 'crypto';
import { AccountStore, StoredAccount } from '../account/account-store';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');

const OKX_PRIVATE_CHANNELS = new Set([
  'account',
  'account-greeks',
  'balance_and_position',
  'liquidation-warning',
  'orders',
  'orders-algo',
  'positions',
]);

// WebSocket 连接信息接口
interface ConnectionInfo {
  ws: WebSocket;
  refCount: number;
  callbacks: Set<(data: any) => void>;
  exchange: string;
  channel: string;
  symbol: string;
  closed: boolean;
  requiresAuth: boolean;
  authenticated: boolean;
  awaitingLogin: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

// 交易所 WebSocket 数据推送服务
@Injectable()
export class ExchangeWsService {
  private readonly logger = new Logger(ExchangeWsService.name);
  // 连接池管理（key: exchange:scope:channel:symbol）
  private connections = new Map<string, ConnectionInfo>();
  // HTTP 代理实例
  private proxyAgent: any = null;

  constructor(private readonly accountStore: AccountStore) {
    // 初始化代理配置
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    if (proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      this.logger.log(`使用代理: ${proxyUrl}`);
    }
  }

  // 订阅行情或私有推送，支持引用计数管理多个订阅者
  subscribe(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    if (exchange !== 'okx' && exchange !== 'binance') {
      this.logger.warn(`WebSocket 不支持 ${exchange}，跳过订阅`);
      return;
    }

    const key = this.getConnectionKey(exchange, channel, symbol);
    const existing = this.connections.get(key);
    if (existing) {
      existing.refCount++;
      existing.callbacks.add(callback);
      return;
    }

    const requiresAuth = this.requiresAuth(exchange, channel);
    if (requiresAuth && exchange === 'okx' && !this.accountStore.getActiveOkx()) {
      this.logger.warn(`OKX 私有频道 ${channel} 订阅失败：未找到已激活的 API 账户`);
      return;
    }

    const ws = this.createSocket(exchange, requiresAuth, channel);
    const conn: ConnectionInfo = {
      ws,
      refCount: 1,
      callbacks: new Set([callback]),
      exchange,
      channel,
      symbol,
      closed: false,
      requiresAuth,
      authenticated: false,
      awaitingLogin: false,
    };

    this.connections.set(key, conn);
    this.logger.log(`WS 连接: ${exchange} ${requiresAuth ? 'private' : 'public'} ${channel} ${symbol || '*'}`);

    this.attachHandlers(conn);
    ws.on('open', () => {
      this.logger.log(`WS 已连接: ${exchange} ${channel} ${symbol || '*'}`);
      this.handleOpen(conn);
    });
  }

  // 移除指定订阅回调
  removeCallback(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    const key = this.getConnectionKey(exchange, channel, symbol);
    const conn = this.connections.get(key);
    if (!conn) return;
    conn.callbacks.delete(callback);
  }

  // 取消订阅，引用计数归零时关闭连接
  unsubscribe(exchange: string, channel: string, symbol: string): void {
    const key = this.getConnectionKey(exchange, channel, symbol);
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.refCount--;
    if (conn.refCount <= 0) {
      this.closeConnection(key);
    }
  }

  // 绑定 WebSocket 事件处理器
  private attachHandlers(conn: ConnectionInfo): void {
    const { ws } = conn;

    ws.on('message', (data: WebSocket.Data) => {
      const parsed = this.parseMessage(conn, data);
      if (parsed !== null) {
        conn.callbacks.forEach((cb) => cb(parsed));
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(
        `WS 断开: ${conn.exchange} ${conn.channel} ${conn.symbol || '*'} code=${code} reason=${reason?.toString?.() || ''}`,
      );
      conn.awaitingLogin = false;
      conn.authenticated = false;
      if (!conn.closed) {
        conn.reconnectTimer = setTimeout(() => {
          this.logger.log(`WS 重连: ${conn.exchange} ${conn.channel} ${conn.symbol || '*'}`);
          this.reconnect(conn);
        }, 3000);
      }
    });

    ws.on('error', (err: Error) => {
      this.logger.error(`WS 错误: ${conn.exchange} ${conn.channel} ${conn.symbol || '*'} - ${err.message}`);
    });
  }

  // 关闭并清理连接
  private closeConnection(key: string): void {
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.closed = true;
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }
    conn.ws.close();
    this.connections.delete(key);
    this.logger.log(`WS 关闭: ${conn.exchange} ${conn.channel} ${conn.symbol || '*'}`);
  }

  // 重新建立 WebSocket 连接
  private reconnect(conn: ConnectionInfo): void {
    if (conn.closed) return;

    conn.authenticated = false;
    conn.awaitingLogin = false;

    const ws = this.createSocket(conn.exchange, conn.requiresAuth, conn.channel);
    conn.ws = ws;

    this.attachHandlers(conn);
    ws.on('open', () => {
      this.logger.log(`WS 重连成功: ${conn.exchange} ${conn.channel} ${conn.symbol || '*'}`);
      this.handleOpen(conn);
    });
  }

  private handleOpen(conn: ConnectionInfo): void {
    if (conn.exchange === 'okx' && conn.requiresAuth) {
      const account = this.accountStore.getActiveOkx();
      if (!account) {
        this.logger.warn(`OKX 私有 WS 登录失败：未找到已激活的 API 账户`);
        conn.ws.close();
        return;
      }
      this.sendOkxLogin(conn, account);
      return;
    }

    this.sendSubscribe(conn.ws, conn.exchange, conn.channel, conn.symbol);
  }

  private createSocket(exchange: string, requiresAuth: boolean, channel = ''): WebSocket {
    const okxAccount = exchange === 'okx' ? this.accountStore.getActiveOkx() : undefined;
    const wsUrl = this.getWsUrl(exchange, requiresAuth, okxAccount?.isTestnet, channel);
    if (exchange === 'okx') {
      this.logger.log(`WS 创建: ${wsUrl} ${okxAccount?.isTestnet ? '(模拟网)' : ''}`);
    }
    return new WebSocket(wsUrl, { agent: this.proxyAgent ?? undefined });
  }

  private getConnectionKey(exchange: string, channel: string, symbol: string): string {
    const scope = this.requiresAuth(exchange, channel) ? 'private' : 'public';
    return `${exchange}:${scope}:${channel}:${symbol || '*'}`;
  }

  private requiresAuth(exchange: string, channel: string): boolean {
    return exchange === 'okx' && OKX_PRIVATE_CHANNELS.has(channel);
  }

  // 获取交易所 WebSocket 地址
  private getWsUrl(exchange: string, requiresAuth = false, isTestnet?: boolean, channel = ''): string {
    if (exchange === 'binance') {
      return 'wss://fstream.binance.com/ws';
    }
    if (exchange === 'okx') {
      if (requiresAuth) {
        return isTestnet
          ? 'wss://wspap.okx.com:8443/ws/v5/private?brokerId=9999'
          : 'wss://ws.okx.com:8443/ws/v5/private';
      }
      // OKX 的 candle 频道挂在 business 端点，而不是 public 端点。
      if (channel.startsWith('candle')) {
        return isTestnet
          ? 'wss://wspap.okx.com:8443/ws/v5/business?brokerId=9999'
          : 'wss://ws.okx.com:8443/ws/v5/business';
      }
      return isTestnet
        ? 'wss://wspap.okx.com:8443/ws/v5/public?brokerId=9999'
        : 'wss://ws.okx.com:8443/ws/v5/public';
    }
    throw new Error(`Exchange ${exchange} does not support WebSocket`);
  }

  private sendOkxLogin(conn: ConnectionInfo, account: StoredAccount): void {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const prehash = `${timestamp}GET/users/self/verify`;
    const sign = crypto.createHmac('sha256', account.apiSecret).update(prehash).digest('base64');

    const payload = {
      op: 'login',
      args: [{
        apiKey: account.apiKey,
        passphrase: account.passphrase,
        timestamp,
        sign,
      }],
    };

    conn.awaitingLogin = true;
    conn.authenticated = false;
    conn.ws.send(JSON.stringify(payload));
    this.logger.log(`OKX 私有 WS 登录请求已发送: ${conn.channel} ${conn.symbol || '*'}`);
  }

  // 将通用交易对符号转换为 Binance 格式
  private toBinanceSymbol(symbol: string): string {
    return symbol.replace(/-/g, '').replace('SWAP', '').toLowerCase();
  }

  private normalizeOkxChannel(channel: string): string {
    return channel
      .replace(/^candle(\d+)h$/, (_, n) => `candle${n}H`)
      .replace(/^candle(\d+)d$/, (_, n) => `candle${n}D`);
  }

  // 发送订阅消息到交易所
  private sendSubscribe(ws: WebSocket, exchange: string, channel: string, symbol: string): void {
    if (exchange === 'okx') {
      const arg: Record<string, string> = {
        channel: this.normalizeOkxChannel(channel),
      };
      if (symbol && symbol !== '*') {
        arg.instId = symbol;
      }
      const msg = JSON.stringify({
        op: 'subscribe',
        args: [arg],
      });
      ws.send(msg);
      return;
    }

    if (exchange === 'binance') {
      const bsym = this.toBinanceSymbol(symbol);
      let streamSuffix: string;

      if (channel === 'tickers') {
        streamSuffix = '@ticker';
      } else if (channel === 'books') {
        streamSuffix = '@depth20@100ms';
      } else if (channel.startsWith('candle')) {
        const interval = channel.replace('candle', '');
        streamSuffix = `@kline_${interval}`;
      } else if (channel === 'trades') {
        streamSuffix = '@trade';
      } else {
        streamSuffix = `@${channel}`;
      }

      const msg = JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`${bsym}${streamSuffix}`],
        id: 1,
      });
      ws.send(msg);
    }
  }

  // 解析 WebSocket 原始消息
  private parseMessage(conn: ConnectionInfo, raw: WebSocket.Data): any {
    const str = raw instanceof Buffer ? raw.toString() : String(raw);

    if (conn.exchange === 'okx' && str === 'ping') {
      conn.ws.send('pong');
      return null;
    }

    let msg: any;
    try {
      msg = JSON.parse(str);
    } catch {
      return null;
    }

    if (conn.exchange === 'okx') {
      return this.parseOkxMessage(conn, msg);
    }

    if (conn.exchange === 'binance') {
      return this.parseBinanceMessage(conn.channel, msg);
    }

    return null;
  }

  // 解析 OKX 交易所的消息
  private parseOkxMessage(conn: ConnectionInfo, msg: any): any {
    if (msg.event === 'login') {
      conn.awaitingLogin = false;
      if (msg.code === '0' || msg.code === 0 || msg.code === undefined) {
        conn.authenticated = true;
        this.logger.log(`OKX 私有 WS 登录成功: ${conn.channel} ${conn.symbol || '*'}`);
        this.sendSubscribe(conn.ws, conn.exchange, conn.channel, conn.symbol);
      } else {
        this.logger.error(`OKX 私有 WS 登录失败: code=${msg.code} msg=${msg.msg || ''}`);
      }
      return null;
    }

    if (msg.event === 'error') {
      this.logger.error(`OKX WS 事件错误: channel=${conn.channel} code=${msg.code || ''} msg=${msg.msg || ''}`);
      return null;
    }

    if (msg.event === 'subscribe' || msg.event === 'unsubscribe') {
      return null;
    }

    if (conn.requiresAuth) {
      if (msg.data === undefined) return null;
      return {
        arg: msg.arg ?? null,
        data: msg.data,
      };
    }

    if (conn.channel === 'tickers') {
      if (!msg.data?.[0]) return null;
      const d = msg.data[0];
      const last = d.last || '0';
      const open24h = d.open24h || last;
      const change = Number(last) - Number(open24h);
      const changePct = Number(open24h) ? ((change / Number(open24h)) * 100).toFixed(2) : '0.00';
      return {
        symbol: d.instId,
        lastPrice: d.last,
        markPrice: d.markPx || d.last,
        indexPrice: d.idxPx || d.last,
        bidPrice: d.bidPx,
        askPrice: d.askPx,
        high24h: d.high24h,
        low24h: d.low24h,
        volume24h: d.vol24h,
        priceChangePercent24h: changePct,
      };
    }

    if (conn.channel === 'books') {
      if (!msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        symbol: msg.arg?.instId || '',
        bids: (d.bids || []).map((b: string[]) => [b[0], b[1]] as [string, string]),
        asks: (d.asks || []).map((a: string[]) => [a[0], a[1]] as [string, string]),
      };
    }

    if (conn.channel.startsWith('candle')) {
      if (!msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        openTime: Number(d[0]),
        open: d[1],
        high: d[2],
        low: d[3],
        close: d[4],
        volume: d[5],
      };
    }

    if (conn.channel === 'trades') {
      if (!msg.data?.length) return null;
      return msg.data.map((t: any) => ({
        price: t.px,
        qty: t.sz,
        side: t.side,
        ts: Number(t.ts),
      }));
    }

    return null;
  }

  // 解析 Binance 交易所的消息
  private parseBinanceMessage(channel: string, msg: any): any {
    if (!msg.e) return null;

    if (msg.e === '24hrTicker' && channel === 'tickers') {
      const last = msg.c || '0';
      const open = msg.o || last;
      const change = Number(last) - Number(open);
      const changePct = Number(open) ? ((change / Number(open)) * 100).toFixed(2) : '0.00';
      const rawSymbol = msg.s || '';
      const symbol = this.fromBinanceSymbol(rawSymbol);
      return {
        symbol,
        lastPrice: msg.c,
        markPrice: msg.c,
        indexPrice: msg.c,
        bidPrice: msg.c,
        askPrice: msg.c,
        high24h: msg.h,
        low24h: msg.l,
        volume24h: msg.v,
        priceChangePercent24h: changePct,
      };
    }

    if (msg.e === 'depthUpdate' && channel === 'books') {
      const rawSymbol = msg.s || '';
      const symbol = this.fromBinanceSymbol(rawSymbol);
      return {
        symbol,
        bids: (msg.b || []).map((b: string[]) => [b[0], b[1]] as [string, string]),
        asks: (msg.a || []).map((a: string[]) => [a[0], a[1]] as [string, string]),
      };
    }

    if (msg.e === 'kline' && channel.startsWith('candle')) {
      const k = msg.k;
      if (!k) return null;
      return {
        openTime: k.t,
        open: k.o,
        high: k.h,
        low: k.l,
        close: k.c,
        volume: k.v,
      };
    }

    if (msg.e === 'trade' && channel === 'trades') {
      return [{
        price: msg.p,
        qty: msg.q,
        side: msg.m ? 'sell' : 'buy',
        ts: msg.T,
      }];
    }

    return null;
  }

  // 将 Binance 交易对符号转换为通用格式
  private fromBinanceSymbol(binanceSymbol: string): string {
    let base = binanceSymbol;
    if (base.endsWith('USDT')) {
      base = base.slice(0, -4) + '-USDT-SWAP';
    }
    return base;
  }
}
