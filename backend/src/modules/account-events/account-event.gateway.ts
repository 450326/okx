import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

function tokenOf(client: Socket): string {
  const authToken = (client.handshake.auth as Record<string, unknown> | undefined)?.token;
  const queryToken = client.handshake.query?.token;
  return String(authToken || queryToken || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * 账户实时事件网关。
 * 只负责鉴权、房间隔离和广播；所有事件由领域服务产生后传入。
 */
@WebSocketGateway({ cors: true, namespace: '/account' })
export class AccountEventGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly auth: AuthService) {}

  handleConnection(client: Socket): void {
    try {
      const user = this.auth.verifyAccessToken(tokenOf(client));
      client.data.userId = user.id;
      void client.join(`user:${user.id}`);
      client.emit('ready', { userId: user.id, ts: Date.now() });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Socket.IO 自动清理 room 成员。
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, {
      type: event,
      payload,
      ts: Date.now(),
    });
  }
}
