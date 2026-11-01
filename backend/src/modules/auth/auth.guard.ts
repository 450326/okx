import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestContextService } from './request-context.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly context: RequestContextService,
  ) {}

  canActivate(executionContext: ExecutionContext): boolean {
    const request = executionContext.switchToHttp().getRequest();
    const authorization = request.headers?.authorization as string | undefined;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);

    if (authorization) {
      try {
        const user = this.auth.verifyAccessToken(authorization);
        request.user = user;
        this.context.enter(user);
        return true;
      } catch (error) {
        if (isPublic) return true;
        throw error instanceof UnauthorizedException
          ? error
          : new UnauthorizedException('无效的访问令牌');
      }
    }

    if (isPublic) return true;
    throw new UnauthorizedException('请先登录');
  }
}
