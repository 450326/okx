import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AppNotification } from './notification.store';

function tokenOf(client: Socket): string {
  const authToken = (client.handshake.auth as Record<string, unknown> | undefined)?.token;
  const queryToken = client.handshake.query?.token;
  return String(authToken || queryToken || '').replace(/^Bearer\s+/i, '').trim();
}

@WebSocketGateway({ cors: true, namespace: '/notifications' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly auth: AuthService) {}

  handleConnection(client: Socket): void {
    try {
      const user = this.auth.verifyAccessToken(tokenOf(client));
      client.data.userId = user.id;
      void client.join(`user:${user.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Socket.IO 自动清理房间成员。
  }

  emitToUser(userId: string, notification: AppNotification): void {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
