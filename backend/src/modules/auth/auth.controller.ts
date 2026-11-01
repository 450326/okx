import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

function clientIp(request: any): string {
  const forwarded = request.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return request.ip || request.socket?.remoteAddress || 'unknown';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: { email: string; password: string; nickname?: string }) {
    return ok(this.auth.register(body.email, body.password, body.nickname));
  }

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }, @Req() request: any) {
    return ok(this.auth.login(body.email, body.password, clientIp(request)));
  }

  @Public()
  @Post('guest')
  guest() {
    return ok(this.auth.guest());
  }

  @Public()
  @Post('verify-email')
  async verifyEmail(@Body() body: { token: string }) {
    return ok(await this.auth.verifyEmail(body.token));
  }

  @Post('resend-verification')
  async resendVerification(@Req() request: any) {
    return ok(await this.auth.resendVerification(request.user.id));
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return ok(await this.auth.forgotPassword(body.email));
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: { token: string; password: string }) {
    return ok(this.auth.resetPassword(body.token, body.password));
  }

  @Post('2fa/setup')
  setupTotp(@Req() request: any) {
    return ok(this.auth.setupTotp(request.user.id));
  }

  @Post('2fa/enable')
  enableTotp(@Req() request: any, @Body() body: { code: string }) {
    return ok(this.auth.enableTotp(request.user.id, body.code));
  }

  @Post('2fa/disable')
  disableTotp(@Req() request: any, @Body() body: { code: string }) {
    return ok(this.auth.disableTotp(request.user.id, body.code));
  }

  @Public()
  @Post('2fa/verify')
  verifyTwoFactor(@Body() body: { challengeToken: string; code: string }) {
    return ok(this.auth.verifyTwoFactor(body.challengeToken, body.code));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return ok(this.auth.refresh(body.refreshToken));
  }

  @Post('logout')
  logout(@Req() request: any, @Body() body: { refreshToken?: string }) {
    this.auth.logout(body?.refreshToken, request.user.id);
    return ok({ loggedOut: true });
  }

  @Get('me')
  me(@Req() request: any) {
    return ok(this.auth.profile(request.user));
  }
}
