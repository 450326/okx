import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { ExchangeWsService } from './exchange-ws.service';

@Module({
  providers: [WsGateway, ExchangeWsService],
})
export class WsModule {}
