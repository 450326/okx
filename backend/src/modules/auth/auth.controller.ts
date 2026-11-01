// 引入 NestJS 控制器相关装饰器
import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
// 引入统一响应成功方法
import { ok } from '../../common/api-response';
import { CurrentUserService } from './current-user.service';

// 认证授权控制器
@Controller('auth')
export class AuthController {
  constructor(private readonly currentUser: CurrentUserService) {}

  // 用户注册接口
  @Post('register')
  register(@Body() body: { email: string; password: string; nickname: string }) {
    const user = this.currentUser.resolve(this.currentUser.createMockToken(body.email));
    return ok({
      userId: user.id,
      ...body,
      isSuper: user.isSuper,
    });
  }

  // 用户登录接口，返回 JWT token
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    const email = String(body.email || 'demo@test.com');
    const token = this.currentUser.createMockToken(email);
    const user = this.currentUser.resolve(token);
    return ok({
      accessToken: token,
      refreshToken: token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        isSuper: user.isSuper,
        defaultMode: 'simulation',
      },
    });
  }

  // 获取当前登录用户信息
  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const user = this.currentUser.resolve(authorization);
    return ok({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isSuper: user.isSuper,
      defaultMode: 'simulation',
    });
  }
}
