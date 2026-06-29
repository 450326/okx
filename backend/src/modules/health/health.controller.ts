// 引入 NestJS 控制器相关装饰器
import { Controller, Get } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

// 健康检查控制器
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
