import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';
import { AccountModeStore } from './account-mode.store';
import { AccountModeService } from './account-mode.service';

@Module({
  controllers: [AccountController],
  providers: [OkxApiService, AccountStore, AccountModeStore, AccountModeService],
  exports: [AccountStore, OkxApiService, AccountModeStore, AccountModeService],
})
export class AccountModule {}
