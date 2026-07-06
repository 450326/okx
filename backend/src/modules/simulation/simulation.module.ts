import { Global, Module } from '@nestjs/common';
import { SimulationState } from './simulation-state';

@Global()
@Module({
  providers: [SimulationState],
  exports: [SimulationState],
})
export class SimulationModule {}
