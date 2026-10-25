import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { DexService } from './dex.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, DexService],
  exports: [MarketService],
})
export class MarketModule {}
