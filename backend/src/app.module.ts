import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { MarketModule } from './modules/market/market.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PositionsModule } from './modules/positions/positions.module';
import { ExchangeModule } from './modules/exchange/exchange.module';
import { RiskModule } from './modules/risk/risk.module';
import { SymbolsModule } from './modules/symbols/symbols.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { WsModule } from './modules/ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    AuthModule,
    AccountModule,
    MarketModule,
    OrdersModule,
    PositionsModule,
    ExchangeModule,
    RiskModule,
    SymbolsModule,
    LedgerModule,
    SimulationModule,
    WsModule,
  ],
})
export class AppModule {}
