import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { RequestContextService } from '../auth/request-context.service';
import { SimulationRepository } from '../simulation/simulation.repository';

@Controller('risk')
export class RiskController {
  constructor(
    private readonly repository: SimulationRepository,
    private readonly context: RequestContextService,
  ) {}

  @Get('events')
  events(@Query('limit') limit?: string) {
    return ok({
      list: this.repository.listRiskEvents(
        this.context.userId(),
        Math.min(200, Math.max(1, Number(limit) || 50)),
      ),
    });
  }

  @Get('stats')
  stats() {
    if (!this.context.isSuper()) {
      throw new ForbiddenException('仅超级管理员可查看风控统计');
    }
    return ok(this.repository.riskStats());
  }

  @Get('events/all')
  allEvents(@Query('limit') limit?: string) {
    if (!this.context.isSuper()) {
      throw new ForbiddenException('仅超级管理员可查看全部风控事件');
    }
    return ok({
      list: this.repository.listAllRiskEvents(
        Math.min(500, Math.max(1, Number(limit) || 200)),
      ),
    });
  }
}
