import { Global, Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SimulationState } from './simulation-state';
import { SimulationRepository } from './simulation.repository';

@Global()
@Module({
  imports: [MarketModule],
  providers: [SimulationState, SimulationRepository],
  exports: [SimulationState, SimulationRepository],
})
export class SimulationModule {}
