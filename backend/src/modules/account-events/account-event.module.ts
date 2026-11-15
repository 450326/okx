import { Global, Module } from '@nestjs/common';
import { AccountEventGateway } from './account-event.gateway';
import { AccountEventService } from './account-event.service';

@Global()
@Module({
  providers: [AccountEventGateway, AccountEventService],
  exports: [AccountEventGateway, AccountEventService],
})
export class AccountEventModule {}
