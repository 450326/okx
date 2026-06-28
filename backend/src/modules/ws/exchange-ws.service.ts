import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');

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

@Injectable()
export class ExchangeWsService {
  private readonly logger = new Logger(ExchangeWsService.name);
  private connections = new Map<string, ConnectionInfo>();
  private proxyAgent: any = null;

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    if (proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      this.logger.log(`使用代理: ${proxyUrl}`);
    }
  }

  subscribe(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    const key = `${exchange}:${channel}:${symbol}`;
    const existing = this.connections.get(key);

    if (existing) {
      existing.refCount++;
      existing.callbacks.add(callback);
      return;
    }

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

    this.attachHandlers(conn);
    ws.on('open', () => {
      this.logger.log(`WS 已连接: ${exchange} ${channel} ${symbol}`);
      this.sendSubscribe(ws, exchange, channel, symbol);
    });
  }

  removeCallback(exchange: string, channel: string, symbol: string, callback: (data: any) => void): void {
    const key = `${exchange}:${channel}:${symbol}`;
    const conn = this.connections.get(key);
    if (!conn) return;
    conn.callbacks.delete(callback);
  }

  unsubscribe(exchange: string, channel: string, symbol: string): void {
    const key = `${exchange}:${channel}:${symbol}`;
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.refCount--;
    if (conn.refCount <= 0) {
      this.closeConnection(key);
    }
  }

  private attachHandlers(conn: ConnectionInfo): void {
    const { ws } = conn;

    ws.on('message', (data: WebSocket.Data) => {
      const parsed = this.parseMessage(conn.exchange, conn.channel, data);
      if (parsed !== null) {
        conn.callbacks.forEach((cb) => cb(parsed));
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(`WS 断开: ${conn.exchange} ${conn.channel} ${conn.symbol} code=${code} reason=${reason?.toString()}`);
      if (!conn.closed) {
        conn.reconnectTimer = setTimeout(() => {
          this.logger.log(`WS 重连: ${conn.exchange} ${conn.channel} ${conn.symbol}`);
          this.reconnect(conn);
        }, 3000);
      }
    });

    ws.on('error', (err: Error) => {
      this.logger.error(`WS 错误: ${conn.exchange} ${conn.channel} ${conn.symbol} - ${err.message}`);
    });
  }

  private closeConnection(key: string): void {
    const conn = this.connections.get(key);
    if (!conn) return;

    conn.closed = true;
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
    }
    conn.ws.close();
    this.connections.delete(key);
    this.logger.log(`WS 关闭: ${conn.exchange} ${conn.channel} ${conn.symbol}`);
  }

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

  private getWsUrl(exchange: string): string {
    return exchange === 'binance'
      ? 'wss://fstream.binance.com/ws'
      : 'wss://ws.okx.com:8443/ws/v5/public';
  }

  private toBinanceSymbol(symbol: string): string {
    return symbol.replace(/-/g, '').replace('SWAP', '').toLowerCase();
  }

  private sendSubscribe(ws: WebSocket, exchange: string, channel: string, symbol: string): void {
    if (exchange === 'okx') {
      const normalizedChannel = channel
        .replace(/^candle(\d+)h$/, (_, n) => `candle${n}H`)
        .replace(/^candle(\d+)d$/, (_, n) => `candle${n}D`);
      const msg = JSON.stringify({
        op: 'subscribe',
        args: [{ channel: normalizedChannel, instId: symbol }],
      });
      ws.send(msg);
    } else if (exchange === 'binance') {
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

  private parseOkxMessage(channel: string, msg: any): any {
    if (msg.event === 'error' || msg.event === 'subscribe' || msg.event === 'unsubscribe') {
      return null;
    }

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

    if (channel === 'books') {
      if (!msg.data?.[0]) return null;
      const d = msg.data[0];
      return {
        symbol: msg.arg?.instId || '',
        bids: (d.bids || []).map((b: string[]) => [b[0], b[1]] as [string, string]),
        asks: (d.asks || []).map((a: string[]) => [a[0], a[1]] as [string, string]),
      };
    }

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

  private fromBinanceSymbol(binanceSymbol: string): string {
    let base = binanceSymbol;
    if (base.endsWith('USDT')) {
      base = base.slice(0, -4) + '-USDT-SWAP';
    }
    return base;
  }
}
