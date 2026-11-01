// 引入 NestJS 模块装饰器
import { Module } from '@nestjs/common';
// 引入全局异常过滤器注册令牌
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
// 引入环境变量配置模块
import { ConfigModule } from '@nestjs/config';
// 引入健康检查模块
import { HealthModule } from './modules/health/health.module';
// 引入认证授权模块
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { NotificationModule } from './modules/notifications/notification.module';
// 引入账户管理模块
import { AccountModule } from './modules/account/account.module';
// 引入行情数据模块
import { MarketModule } from './modules/market/market.module';
// 引入预测市场模块
import { PredictionModule } from './modules/prediction/prediction.module';
// 引入现货交易模块
import { SpotModule } from './modules/spot/spot.module';
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
// 引入模拟盘业务异常过滤器
import { SimulationExceptionFilter } from './modules/simulation/simulation-exception.filter';
// 引入能力矩阵异常过滤器
import { CapabilityExceptionFilter } from './modules/account/capability-exception.filter';
// 引入实盘下单异常过滤器
import { LiveOrderExceptionFilter } from './modules/account/live-order-exception.filter';

// 应用根模块，汇总所有子模块
@Module({
  imports: [
    // 全局环境变量配置
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    AuthModule,
    NotificationModule,
    AccountModule,
    MarketModule,
    PredictionModule,
    SpotModule,
    OrdersModule,
    PositionsModule,
    ExchangeModule,
    RiskModule,
    SymbolsModule,
    LedgerModule,
    SimulationModule,
    WsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    // 模拟盘业务错误统一返回 { code, message, data }，避免 Nest 默认 400 结构丢失业务码。
    { provide: APP_FILTER, useClass: SimulationExceptionFilter },
    { provide: APP_FILTER, useClass: CapabilityExceptionFilter },
    { provide: APP_FILTER, useClass: LiveOrderExceptionFilter },
  ],
})
export class AppModule {}
