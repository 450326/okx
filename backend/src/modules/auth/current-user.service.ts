import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.store';

/**
 * 兼容能力矩阵等仍按 authorization 字符串取用户的内部调用。
 * 真正的 401 守卫在 AuthGuard；这里只负责解析已验证或待验证的 token。
 */
@Injectable()
export class CurrentUserService {
  constructor(private readonly auth: AuthService) {}

  resolve(authorization?: string): AuthUser {
    if (authorization) {
      try {
        return this.auth.verifyAccessToken(authorization);
      } catch {
        // 公开接口或无效 token 由 AuthGuard 处理，这里回退为演示账号占位。
      }
    }
    return {
      id: 'u_demo',
      email: 'demo@test.com',
      nickname: 'Demo User',
      isGuest: false,
      isSuper: false,
      emailVerified: true,
      totpEnabled: false,
      tokenVersion: 0,
      guestExpiresAt: null,
      createdAt: new Date(0).toISOString(),
    };
  }
}
