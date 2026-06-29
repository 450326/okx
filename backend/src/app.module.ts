// 引入 NestJS 模块装饰器
import { Module } from '@nestjs/common';
// 引入环境变量配置模块
import { ConfigModule } from '@nestjs/config';
// 引入健康检查模块
import { HealthModule } from './modules/health/health.module';
// 引入认证授权模块
import { AuthModule } from './modules/auth/auth.module';
// 引入账户管理模块
import { AccountModule } from './modules/account/account.module';
// 引入行情数据模块
import { MarketModule } from './modules/market/market.module';
// 引入订单管理模块
import { OrdersModule } from './modules/orders/orders.module';
// 引入持仓管理模块
import { PositionsModule } from './modules/positions/positions.module';
// 引入交易所接入模块
import { ExchangeModule } from './modules/exchange/exchange.module';
// 引入风控管理模块
import { RiskModule } from './modules/risk/risk.module';
// 引入交易品种模块
import { SymbolsModule } from './modules/symbols/symbols.module';
// 引入账本记录模块
import { LedgerModule } from './modules/ledger/ledger.module';
// 引入模拟交易模块
import { SimulationModule } from './modules/simulation/simulation.module';
// 引入 WebSocket 模块
import { WsModule } from './modules/ws/ws.module';

// 应用根模块，汇总所有子模块
@Module({
  imports: [
    // 全局环境变量配置
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
