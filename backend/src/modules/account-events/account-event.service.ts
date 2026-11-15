import { Injectable } from '@nestjs/common';
import { AccountEventGateway } from './account-event.gateway';

@Injectable()
export class AccountEventService {
  constructor(private readonly gateway: AccountEventGateway) {}

  emit(userId: string, event: string, payload: unknown): void {
    this.gateway.emitToUser(userId, event, payload);
  }

  emitSnapshot(
    userId: string,
    snapshot: {
      account?: unknown;
      positions?: unknown;
      orders?: unknown;
      history?: unknown;
    },
  ): void {
    if (snapshot.orders !== undefined || snapshot.history !== undefined) {
      this.emit(userId, 'order:update', {
        orders: snapshot.orders,
        history: snapshot.history,
      });
    }
    if (snapshot.positions !== undefined) this.emit(userId, 'position:update', { positions: snapshot.positions });
    if (snapshot.account !== undefined) this.emit(userId, 'asset:update', snapshot.account);
  }

  emitPositionClosed(
    userId: string,
    payload: {
      positionId: string;
      symbol: string;
      reason: 'manual' | 'tp' | 'sl' | 'liquidation';
      realizedPnl?: number;
    },
  ): void {
    this.emit(userId, 'position:closed', payload);
  }

  emitNotification(userId: string, notification: unknown): void {
    this.emit(userId, 'notification', notification);
    const type = (notification as { type?: string } | null)?.type;
    if (type === 'risk_warning') this.emit(userId, 'risk:warning', notification);
  }
}
