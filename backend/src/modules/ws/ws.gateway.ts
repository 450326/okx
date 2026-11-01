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
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.store';

const PRIVATE_CHANNELS = new Set([
  'account',
  'account-greeks',
  'balance_and_position',
  'liquidation-warning',
  'orders',
  'orders-algo',
  'positions',
]);

function socketToken(client: Socket): string {
  const authToken = (client.handshake.auth as Record<string, unknown> | undefined)?.token;
  const queryToken = client.handshake.query?.token;
  const header = client.handshake.headers?.authorization;
  return String(authToken || queryToken || header || '').replace(/^Bearer\s+/i, '').trim();
}

// WebSocket 行情网关，监听 /market 命名空间
@WebSocketGateway({ cors: true, namespace: '/market' })
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // 客户端订阅关系映射表（clientId -> subKey -> callback）
  private clientSubscriptions = new Map<string, Map<string, (data: any) => void>>();

  constructor(
    private readonly exchangeWsService: ExchangeWsService,
    private readonly auth: AuthService,
  ) {}

  // 新客户端连接时初始化订阅映射，并解析可选登录态
  handleConnection(client: Socket): void {
    this.clientSubscriptions.set(client.id, new Map());
    const token = socketToken(client);
    if (!token) return;
    try {
      const user: AuthUser = this.auth.verifyAccessToken(token);
      client.data.user = user;
    } catch {
      // 公共行情仍可继续使用；私有频道订阅时再拒绝。
      client.data.user = null;
    }
  }

  // 客户端断开时清理所有订阅
  handleDisconnect(client: Socket): void {
    const clientSubs = this.clientSubscriptions.get(client.id);
    if (!clientSubs) return;

    for (const [subKey, callback] of clientSubs.entries()) {
      const parts = subKey.split(':');
      const scope = parts.shift() || 'public';
      const exchange = parts.shift() || '';
      const channel = parts.shift() || '';
      const symbol = parts.join(':');
      const userId = scope === 'public' ? undefined : scope.replace(/^private:/, '');
      this.exchangeWsService.removeCallback(exchange, channel, symbol, callback, userId);
      this.exchangeWsService.unsubscribe(exchange, channel, symbol, userId);
    }

    this.clientSubscriptions.delete(client.id);
  }

  // 处理客户端订阅请求
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { exchange: string; channel: string; symbol: string; interval?: string }): void {
    const { exchange, channel: rawChannel, symbol, interval } = payload || ({} as any);

    // 将 kline 通道转换为 candle 格式
    let actualChannel = rawChannel;
    if (rawChannel === 'kline' && interval) {
      actualChannel = `candle${interval}`;
    }

    const isPrivate = PRIVATE_CHANNELS.has(rawChannel);
    const user = client.data.user as AuthUser | null | undefined;
    if (isPrivate && !user) {
      client.emit('error', { code: 401, message: '私有频道需要登录' });
      return;
    }

    // 创建推送回调，将数据转发给对应客户端
    const callback = (data: any) => {
      this.server.to(client.id).emit(rawChannel, { channel: rawChannel, symbol, data });
    };

    // 通过服务层订阅行情；私有频道必须带上当前 socket 的用户
    const ok = this.exchangeWsService.subscribe(
      exchange,
      actualChannel,
      symbol,
      callback,
      isPrivate ? user?.id : undefined,
    );
    if (!ok) {
      client.emit('error', { code: 403, message: '订阅失败：未绑定有效的 API 账户' });
      return;
    }

    // 记录订阅关系以便断开时清理
    const scope = isPrivate ? `private:${user?.id}` : 'public';
    const subKey = `${scope}:${exchange}:${actualChannel}:${symbol}`;
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

    for (const [subKey, callback] of clientSubs.entries()) {
      const parts = subKey.split(':');
      const scope = parts.shift() || 'public';
      const ex = parts.shift() || '';
      const ch = parts.shift() || '';
      const sym = parts.join(':');
      if (ex !== exchange || sym !== symbol) continue;
      if (rawChannel === 'kline' ? ch.startsWith('candle') : ch === rawChannel) {
        const userId = scope === 'public' ? undefined : scope.replace(/^private:/, '');
        this.exchangeWsService.removeCallback(ex, ch, sym, callback, userId);
        this.exchangeWsService.unsubscribe(ex, ch, sym, userId);
        clientSubs.delete(subKey);
      }
    }
  }
}
