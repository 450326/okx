import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ExchangeWsService } from './exchange-ws.service';

@WebSocketGateway({ cors: true, namespace: '/market' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientSubscriptions = new Map<string, Map<string, (data: any) => void>>();

  constructor(private readonly exchangeWsService: ExchangeWsService) {}

  handleConnection(client: Socket): void {
    this.clientSubscriptions.set(client.id, new Map());
  }

  handleDisconnect(client: Socket): void {
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (!clientSubs) return;

    for (const [subKey, callback] of clientSubs.entries()) {
      const [exchange, channel, symbol] = subKey.split(':');
      this.exchangeWsService.removeCallback(exchange, channel, symbol, callback);
      this.exchangeWsService.unsubscribe(exchange, channel, symbol);
    }

    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { exchange: string; channel: string; symbol: string; interval?: string }): void {
    const { exchange, channel: rawChannel, symbol, interval } = payload;

    let actualChannel = rawChannel;
    if (rawChannel === 'kline' && interval) {
      actualChannel = `candle${interval}`;
    }

    const callback = (data: any) => {
      this.server.to(client.id).emit(rawChannel, { channel: rawChannel, symbol, data });
    };

    this.exchangeWsService.subscribe(exchange, actualChannel, symbol, callback);

    const subKey = `${exchange}:${actualChannel}:${symbol}`;
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (clientSubs) {
      clientSubs.set(subKey, callback);
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, payload: { exchange: string; channel: string; symbol: string }): void {
    const { exchange, channel: rawChannel, symbol } = payload;
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (!clientSubs) return;

    for (const [subKey, callback] of clientSubs.entries()) {
      const [ex, ch, sym] = subKey.split(':');
      if (ex !== exchange || sym !== symbol) continue;
      if (rawChannel === 'kline' ? ch.startsWith('candle') : ch === rawChannel) {
        this.exchangeWsService.removeCallback(ex, ch, sym, callback);
        this.exchangeWsService.unsubscribe(ex, ch, sym);
        clientSubs.delete(subKey);
      }
    }
  }
}
