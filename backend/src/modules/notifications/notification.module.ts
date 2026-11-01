import { Global, Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationStore } from './notification.store';

@Global()
@Module({
  controllers: [NotificationController],
  providers: [NotificationStore, NotificationService, NotificationGateway],
  exports: [NotificationStore, NotificationService, NotificationGateway],
})
export class NotificationModule {}
