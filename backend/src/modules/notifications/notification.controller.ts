import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Query('limit') limit = '50') {
    return ok(this.notifications.list(Number(limit) || 50));
  }

  @Get('unread-count')
  unreadCount() {
    return ok({ unreadCount: this.notifications.list(1).unreadCount });
  }

  @Post('read-all')
  readAll() {
    this.notifications.markAllRead();
    return ok({ read: true });
  }

  @Post(':id/read')
  read(@Param('id') id: string) {
    return ok({ read: this.notifications.markRead(id) });
  }
}
