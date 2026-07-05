import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange.controller';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [AccountModule],
  controllers: [ExchangeController],
})
export class ExchangeModule {}
