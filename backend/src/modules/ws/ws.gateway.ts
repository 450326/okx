// 引入 WebSocket 网关相关装饰器和接口
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
// 引入 Socket.IO 服务端和客户端类型
import { Server, Socket } from 'socket.io';
// 引入交易所 WebSocket 服务
import { ExchangeWsService } from './exchange-ws.service';

// WebSocket 行情网关，监听 /market 命名空间
@WebSocketGateway({ cors: true, namespace: '/market' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // 客户端订阅关系映射表（clientId -> subKey -> callback）
  private clientSubscriptions = new Map<string, Map<string, (data: any) => void>>();

  constructor(private readonly exchangeWsService: ExchangeWsService) {}

  // 新客户端连接时初始化订阅映射
  handleConnection(client: Socket): void {
    this.clientSubscriptions.set(client.id, new Map());
  }

  // 客户端断开时清理所有订阅
  handleDisconnect(client: Socket): void {
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (!clientSubs) return;

    // 遍历该客户端所有订阅并逐一取消
    for (const [subKey, callback] of clientSubs.entries()) {
      const [exchange, channel, symbol] = subKey.split(':');
      this.exchangeWsService.removeCallback(exchange, channel, symbol, callback);
      this.exchangeWsService.unsubscribe(exchange, channel, symbol);
    }

    this.clientSubscriptions.delete(client.id);
  }

  // 处理客户端订阅请求
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { exchange: string; channel: string; symbol: string; interval?: string }): void {
    const { exchange, channel: rawChannel, symbol, interval } = payload;

    // 将 kline 通道转换为 candle 格式
    let actualChannel = rawChannel;
    if (rawChannel === 'kline' && interval) {
      actualChannel = `candle${interval}`;
    }

    // 创建推送回调，将数据转发给对应客户端
    const callback = (data: any) => {
      this.server.to(client.id).emit(rawChannel, { channel: rawChannel, symbol, data });
    };

    // 通过服务层订阅行情
    this.exchangeWsService.subscribe(exchange, actualChannel, symbol, callback);

    // 记录订阅关系以便断开时清理
    const subKey = `${exchange}:${actualChannel}:${symbol}`;
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (clientSubs) {
      clientSubs.set(subKey, callback);
    }
  }

  // 处理客户端取消订阅请求
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, payload: { exchange: string; channel: string; symbol: string }): void {
    const { exchange, channel: rawChannel, symbol } = payload;
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (!clientSubs) return;

    // 遍历客户端订阅找到匹配项并取消
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
