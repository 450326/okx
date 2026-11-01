import { Global, Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { OkxApiService } from './okx-api.service';
import { AccountStore } from './account-store';
import { AccountModeStore } from './account-mode.store';
import { AccountModeService } from './account-mode.service';
import { CapabilityService } from './capability.service';
import { LiveAccountService } from './live-account.service';
import { OkxInstrumentService } from './okx-instrument.service';
import { LiveOrderStore } from './live-order.store';
import { LiveTradingService } from './live-trading.service';

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
    OkxInstrumentService,
    LiveOrderStore,
    LiveTradingService,
  ],
  exports: [
    AccountStore,
    OkxApiService,
    AccountModeStore,
    AccountModeService,
    CapabilityService,
    LiveAccountService,
    OkxInstrumentService,
    LiveOrderStore,
    LiveTradingService,
  ],
})
export class AccountModule {}
