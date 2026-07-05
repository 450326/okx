import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { ExchangeWsService } from './exchange-ws.service';
import { AccountModule } from '../account/account.module';

@Module({
  imports: [AccountModule],
  providers: [WsGateway, ExchangeWsService],
})
export class WsModule {}
