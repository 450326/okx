import { Module } from '@nestjs/common';
import { PredictionController } from './prediction.controller';
import { PolymarketService } from './polymarket.service';
import { PredictionTradingService } from './prediction-trading.service';

// 预测市场模块：独立接入 Polymarket，与合约行情模块解耦
@Module({
  controllers: [PredictionController],
  providers: [PolymarketService, PredictionTradingService],
  exports: [PolymarketService],
})
export class PredictionModule {}
