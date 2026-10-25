import { Global, Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SimulationState } from './simulation-state';

@Global()
@Module({
  imports: [MarketModule],
  providers: [SimulationState],
  exports: [SimulationState],
})
export class SimulationModule {}
