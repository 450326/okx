import { Global, Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';
import { AccountModeStore } from './account-mode.store';
import { AccountModeService } from './account-mode.service';
import { CapabilityService } from './capability.service';
import { LiveAccountService } from './live-account.service';

@Global()
@Module({
  controllers: [AccountController],
  providers: [
    OkxApiService,
    AccountStore,
    AccountModeStore,
    AccountModeService,
    CapabilityService,
    LiveAccountService,
  ],
  exports: [
    AccountStore,
    OkxApiService,
    AccountModeStore,
    AccountModeService,
    CapabilityService,
    LiveAccountService,
  ],
})
export class AccountModule {}
