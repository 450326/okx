// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Get, Post } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';

// 认证授权控制器
@Controller('auth')
export class AuthController {
  // 用户注册接口
  @Post('register')
  register(@Body() body: { email: string; password: string; nickname: string }) {
    return ok({
      userId: 'u_1001',
      ...body,
    });
  }

  // 用户登录接口，返回 JWT token
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return ok({
      accessToken: 'replace-with-jwt',
      refreshToken: 'replace-with-refresh-token',
      user: {
        id: 'u_1001',
        email: body.email,
        nickname: 'Demo User',
        defaultMode: 'simulation',
      },
    });
  }

  // 获取当前登录用户信息
  @Get('me')
  me() {
    return ok({
      id: 'u_1001',
      email: 'demo@test.com',
      nickname: 'Demo User',
      defaultMode: 'simulation',
    });
  }
}
