import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';

@Module({
  controllers: [AccountController],
  providers: [OkxApiService, AccountStore],
  exports: [AccountStore, OkxApiService],
})
export class AccountModule {}
