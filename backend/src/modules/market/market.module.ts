import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { DexService } from './dex.service';
import { PolymarketService } from './polymarket.service';

@Module({
  controllers: [MarketController],
  providers: [MarketService, DexService, PolymarketService],
  exports: [MarketService],
})
export class MarketModule {}
