// 引入 NestJS 控制器相关装饰器
import { Controller, Get } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { Public } from '../auth/public.decorator';

// 健康检查控制器
@Public()
@Controller('health')
export class HealthController {
  // 健康检查接口，用于探测服务运行状态
  @Get()
  getHealth() {
    return ok({
      service: 'okx-futures-backend',
      status: 'ok',
    });
  }
}
