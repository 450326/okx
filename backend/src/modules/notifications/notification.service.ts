import { Injectable } from '@nestjs/common';
import { AccountEventService } from '../account-events/account-event.service';
import { RequestContextService } from '../auth/request-context.service';
import { NotificationGateway } from './notification.gateway';
import {
  AppNotification,
  NotificationSeverity,
  NotificationStore,
  NotificationType,
} from './notification.store';

export type RiskLevel = 'safe' | 'watch' | 'warning' | 'danger';

interface RiskPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  qty: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  unrealizedPnl: number;
}

interface TriggeredOrder {
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  avgFillPrice: number | null;
  source: 'liquidation' | 'tp' | 'sl';
  positionId?: string | null;
  triggerPrice?: number;
  marginRatioAtTrigger?: number;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly context: RequestContextService,
    private readonly gateway: NotificationGateway,
    private readonly accountEvents: AccountEventService,
  ) {}

  list(limit = 50): { list: AppNotification[]; unreadCount: number } {
    const userId = this.context.userId();
    return {
      list: this.store.list(userId, limit),
      unreadCount: this.store.unreadCount(userId),
    };
  }

  markRead(id: string): boolean {
    return this.store.markRead(this.context.userId(), id);
  }

  markAllRead(): void {
    this.store.markAllRead(this.context.userId());
  }

  /**
   * 风险等级跨档时创建站内通知。同一档位只提醒一次；
   * 风险先改善再恶化到同一档位时，会重新提醒。
   */
  syncRisk(userId: string, positions: RiskPosition[]): void {
    const ids = new Set(positions.map((position) => position.id));
    this.store.removeRiskLevelsExcept(userId, ids);

    for (const position of positions) {
      const distance = this.liquidationDistance(position);
      if (distance == null) continue;
      const level = this.riskLevel(distance);
      const previous = this.store.getRiskLevel(userId, position.id);
      if (previous === level) continue;
      this.store.setRiskLevel(userId, position.id, level);
      if (level === 'safe') continue;

      const severity: NotificationSeverity = level === 'danger' ? 'danger' : level === 'warning' ? 'warning' : 'info';
      this.create(userId, {
        type: 'risk_warning',
        severity,
        title:
          level === 'danger'
            ? `强平预警：${position.symbol} 距强平 ${distance.toFixed(2)}%`
            : `风险提示：${position.symbol} 距强平 ${distance.toFixed(2)}%`,
        message: `${position.side === 'long' ? '多单' : '空单'} ${position.leverage}x，标记价 ${position.markPrice}，强平价 ${position.liquidationPrice}。${this.suggestion(level)}`,
        symbol: position.symbol,
        positionId: position.id,
        data: {
          level,
          distance,
          side: position.side,
          leverage: position.leverage,
          qty: position.qty,
          entryPrice: position.entryPrice,
          markPrice: position.markPrice,
          liquidationPrice: position.liquidationPrice,
          unrealizedPnl: position.unrealizedPnl,
        },
      });
    }
  }

  notifyTriggeredOrder(userId: string, order: TriggeredOrder, positionRealizedPnl?: number): void {
    if (!['liquidation', 'tp', 'sl'].includes(order.source)) return;
    const meta: Record<
      TriggeredOrder['source'],
      { type: NotificationType; severity: NotificationSeverity; title: string }
    > = {
      liquidation: { type: 'liquidation', severity: 'danger', title: '仓位已被强制平仓' },
      tp: { type: 'take_profit', severity: 'success', title: '止盈已触发' },
      sl: { type: 'stop_loss', severity: 'warning', title: '止损已触发' },
    };
    const item = meta[order.source];
    const fill = order.avgFillPrice == null ? '市价' : String(order.avgFillPrice);
    const trigger =
      order.triggerPrice == null
        ? ''
        : `触发价 ${order.triggerPrice}，保证金率 ${((order.marginRatioAtTrigger || 0) * 100).toFixed(2)}%。`;
    this.create(userId, {
      type: item.type,
      severity: item.severity,
      title: item.title,
      message: `${order.symbol} ${order.side === 'long' ? '多单' : '空单'} ${order.qty} 已平仓，${trigger}成交价 ${fill}。${
        positionRealizedPnl != null ? `该仓位累计已实现盈亏 ${positionRealizedPnl.toFixed(2)} USDT。` : ''
      }`,
      symbol: order.symbol,
      positionId: order.positionId || undefined,
      data: {
        orderId: order.orderId,
        triggerPrice: order.triggerPrice ?? null,
        fillPrice: order.avgFillPrice,
        marginRatio: order.marginRatioAtTrigger ?? null,
        qty: order.qty,
        source: order.source,
        realizedPnl: positionRealizedPnl ?? null,
      },
    });
  }

  private create(
    userId: string,
    input: Omit<AppNotification, 'id' | 'read' | 'createdAt'>,
  ): AppNotification {
    const notification = this.store.add(userId, input);
    this.gateway.emitToUser(userId, notification);
    this.accountEvents.emitNotification(userId, notification);
    return notification;
  }

  private liquidationDistance(position: RiskPosition): number | null {
    const mark = Number(position.markPrice);
    const liq = Number(position.liquidationPrice);
    if (!Number.isFinite(mark) || !Number.isFinite(liq) || mark <= 0 || liq <= 0) return null;
    const distance =
      position.side === 'long' ? ((mark - liq) / mark) * 100 : ((liq - mark) / mark) * 100;
    return Math.max(0, distance);
  }

  private riskLevel(distance: number): RiskLevel {
    if (distance > 30) return 'safe';
    if (distance > 15) return 'watch';
    if (distance >= 5) return 'warning';
    return 'danger';
  }

  private suggestion(level: RiskLevel): string {
    if (level === 'danger') return '建议立即减仓或追加保证金，避免被强平。';
    if (level === 'warning') return '建议考虑减仓或设置止损，控制风险。';
    return '请关注价格波动，提前做好仓位管理。';
  }
}
