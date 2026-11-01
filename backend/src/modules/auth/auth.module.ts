import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import { AuthGuard } from './auth.guard';
import { CurrentUserService } from './current-user.service';
import { EmailService } from './email.service';
import { GuestCleanupService } from './guest-cleanup.service';
import { LoginThrottleService } from './login-throttle.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthStore,
    AuthService,
    AuthGuard,
    CurrentUserService,
    RequestContextService,
    EmailService,
    LoginThrottleService,
    GuestCleanupService,
  ],
  exports: [
    AuthStore,
    AuthService,
    AuthGuard,
    CurrentUserService,
    RequestContextService,
    EmailService,
    LoginThrottleService,
  ],
})
export class AuthModule {}
