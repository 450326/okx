// 引入 NestJS 可注入和服务日志装饰器
import { Injectable, Logger } from '@nestjs/common';
// 引入 WebSocket 库
import WebSocket from 'ws';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');

// WebSocket 连接信息接口
interface ConnectionInfo {
  ws: WebSocket;
  refCount: number;
  callbacks: Set<(data: any) => void>;
  exchange: string;
  channel: string;
  symbol: string;
  closed: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

// 交易所 WebSocket 数据推送服务
@Injectable()
export class ExchangeWsService {
  private readonly logger = new Logger(ExchangeWsService.name);
  // 连接池管理（key: exchange:channel:symbol）
  private connections = new Map<string, ConnectionInfo>();
  // HTTP 代理实例
  private proxyAgent: any = null;

  constructor() {
    // 初始化代理配置
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    if (proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      this.logger.log(`使用代理: ${proxyUrl}`);
    }
  }

  // 订阅行情数据，支持引用计数管理多个订阅者
  subscribe(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    // Uniswap 和 Polymarket 不支持 WebSocket
    if (exchange !== 'okx' && exchange !== 'binance') {
      this.logger.warn(`WebSocket 不支持 ${exchange}，跳过订阅`);
      return;
    }

    const key = `${exchange}:${channel}:${symbol}`;
    const existing = this.connections.get(key);

    // 如果已存在相同订阅，增加引用计数并添加回调
    if (existing) {
      existing.refCount++;
      existing.callbacks.add(callback);
      return;
    }

    // 创建新的 WebSocket 连接
    const wsUrl = this.getWsUrl(exchange);
    const ws = new WebSocket(wsUrl, { agent: this.proxyAgent ?? undefined });
    const conn: ConnectionInfo = {
      ws,
      refCount: 1,
      callbacks: new Set([callback]),
      exchange,
      channel,
      symbol,
      closed: false,
    };

    this.connections.set(key, conn);
    this.logger.log(`WS 连接: ${exchange} ${channel} ${symbol}`);

    // 绑定事件处理器并订阅数据
    this.attachHandlers(conn);
    ws.on('open', () => {
      this.logger.log(`WS 已连接: ${exchange} ${channel} ${symbol}`);
      this.sendSubscribe(ws, exchange, channel, symbol);
    });
  }

  // 移除指定订阅回调
  removeCallback(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    const key = `${exchange}:${channel}:${symbol}`;
    const conn = this.connections.get(key);
    if (!conn) return;
    conn.callbacks.delete(callback);
  }

  // 取消订阅，引用计数归零时关闭连接
  unsubscribe(exchange: string, channel: string, symbol: string): void {
    const key = `${exchange}:${channel}:${symbol}`;
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

    // 处理收到的消息，解析后分发到各回调
    ws.on('message', (data: WebSocket.Data) => {
      const parsed = this.parseMessage(conn.exchange, conn.channel, data);
      if (parsed !== null) {
        conn.callbacks.forEach((cb) => cb(parsed));
      }
    });

    // 连接断开时自动重连
    ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(`WS 断开: ${conn.exchange} ${conn.channel} ${conn.symbol} code=${code} reason=${reason?.toString()}`);
      if (!conn.closed) {
        conn.reconnectTimer = setTimeout(() => {
          this.logger.log(`WS 重连: ${conn.exchange} ${conn.channel} ${conn.symbol}`);
          this.reconnect(conn);
        }, 3000);
      }
    });

    // 记录错误日志
    ws.on('error', (err: Error) => {
      this.logger.error(`WS 错误: ${conn.exchange} ${conn.channel} ${conn.symbol} - ${err.message}`);
    });
  }

  // 关闭并清理连接
  private closeConnection(key: string): void {
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.closed = true;
    // 清除重连定时器
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }
    conn.ws.close();
    this.connections.delete(key);
    this.logger.log(`WS 关闭: ${conn.exchange} ${conn.channel} ${conn.symbol}`);
  }

  // 重新建立 WebSocket 连接
  private reconnect(conn: ConnectionInfo): void {
    if (conn.closed) return;

    const wsUrl = this.getWsUrl(conn.exchange);
    const ws = new WebSocket(wsUrl, { agent: this.proxyAgent ?? undefined });
    conn.ws = ws;

    this.attachHandlers(conn);
    ws.on('open', () => {
      this.sendSubscribe(ws, conn.exchange, conn.channel, conn.symbol);
    });
  }

  // 获取交易所 WebSocket 地址
  private getWsUrl(exchange: string): string {
    if (exchange === 'binance') {
      return 'wss://fstream.binance.com/ws';
    }
    if (exchange === 'okx') {
      return 'wss://ws.okx.com:8443/ws/v5/public';
    }
    throw new Error(`Exchange ${exchange} does not support WebSocket`);
  }

  // 将通用交易对符号转换为 Binance 格式
  private toBinanceSymbol(symbol: string): string {
    return symbol.replace(/-/g, '').replace('SWAP', '').toLowerCase();
  }

  // 发送订阅消息到交易所
  private sendSubscribe(ws: WebSocket, exchange: string, channel: string, symbol: string): void {
    if (exchange === 'okx') {
      // OKX 订阅协议
      const normalizedChannel = channel
        .replace(/^candle(\d+)h$/, (_, n) => `candle${n}H`)
        .replace(/^candle(\d+)d$/, (_, n) => `candle${n}D`);
      const msg = JSON.stringify({
        op: 'subscribe',
        args: [{ channel: normalizedChannel, instId: symbol }],
      });
      ws.send(msg);
    } else if (exchange === 'binance') {
      // Binance 订阅协议
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
  private parseMessage(exchange: string, channel: string, raw: WebSocket.Data): any {
    let msg: any;
    try {
      const str = raw instanceof Buffer ? raw.toString() : (raw as string);
      msg = JSON.parse(str);
    } catch {
      return null;
    }

    if (exchange === 'okx') {
      return this.parseOkxMessage(channel, msg);
    }

    if (exchange === 'binance') {
      return this.parseBinanceMessage(channel, msg);
    }

    return null;
  }

  // 解析 OKX 交易所的消息
  private parseOkxMessage(channel: string, msg: any): any {
    // 过滤事件类消息
    if (msg.event === 'error' || msg.event === 'subscribe' || msg.event === 'unsubscribe') {
      return null;
    }

    // 解析 ticker 行情数据
    if (channel === 'tickers') {
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

    // 解析订单簿深度数据
    if (channel === 'books') {
      if (!msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        symbol: msg.arg?.instId || '',
        bids: (d.bids || []).map((b: string[]) => [b[0], b[1]] as [string, string]),
        asks: (d.asks || []).map((a: string[]) => [a[0], a[1]] as [string, string]),
      };
    }

    // 解析 K 线数据
    if (channel.startsWith('candle')) {
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

    // 解析成交数据
    if (channel === 'trades') {
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

    // 解析 24 小时 ticker 数据
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

    // 解析订单簿增量更新
    if (msg.e === 'depthUpdate' && channel === 'books') {
      const rawSymbol = msg.s || '';
      const symbol = this.fromBinanceSymbol(rawSymbol);
      return {
        symbol,
        bids: (msg.b || []).map((b: string[]) => [b[0], b[1]] as [string, string]),
        asks: (msg.a || []).map((a: string[]) => [a[0], a[1]] as [string, string]),
      };
    }

    // 解析 K 线数据
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

    // 解析成交数据
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
