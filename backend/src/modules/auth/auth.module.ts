import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CurrentUserService } from './current-user.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [CurrentUserService],
  exports: [CurrentUserService],
})
export class AuthModule {}
