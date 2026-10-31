import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SpotController } from './spot.controller';

@Module({
  imports: [MarketModule],
  controllers: [SpotController],
})
export class SpotModule {}
