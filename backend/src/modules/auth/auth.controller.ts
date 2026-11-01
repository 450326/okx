import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

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
  login(@Body() body: { email: string; password: string }) {
    return ok(this.auth.login(body.email, body.password));
  }

  @Public()
  @Post('guest')
  guest() {
    return ok(this.auth.guest());
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return ok(this.auth.refresh(body.refreshToken));
  }

  @Post('logout')
  logout(@Body() body: { refreshToken?: string }) {
    this.auth.logout(body?.refreshToken);
    return ok({ loggedOut: true });
  }

  @Get('me')
  me(@Req() request: any) {
    return ok(this.auth.profile(request.user));
  }
}
