import { Body, Controller, Get, Post } from '@nestjs/common';
import { ok } from '../../common/api-response';

@Controller('auth')
export class AuthController {
  @Post('register')
  register(@Body() body: { email: string; password: string; nickname: string }) {
    return ok({
      userId: 'u_1001',
      ...body,
    });
  }

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
