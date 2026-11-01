import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuthStore, AuthUser } from './auth.store';
import { EmailService } from './email.service';
import { LoginThrottleService } from './login-throttle.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp.util';

interface AccessPayload {
  sub: string;
  email: string;
  typ: 'access' | '2fa';
  ver: number;
  iat: number;
  exp: number;
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

  constructor(
    private readonly store: AuthStore,
    private readonly email: EmailService,
    private readonly throttle: LoginThrottleService,
  ) {
    const secretPath = path.resolve(__dirname, '../../../data/auth-secret.key');
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (process.env.AUTH_JWT_SECRET) {
      this.secret = process.env.AUTH_JWT_SECRET;
    } else if (fs.existsSync(secretPath)) {
      this.secret = fs.readFileSync(secretPath, 'utf-8').trim();
    } else {
      this.secret = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(secretPath, this.secret, 'utf-8');
    }
  }

  login(emailInput: string, passwordInput: string, ip = 'unknown') {
    const email = String(emailInput || '').trim();
    const password = String(passwordInput || '');
    this.throttle.check(ip, email);
    const user = this.store.verifyLogin(email, password);
    if (!user) {
      this.throttle.recordFailure(ip, email);
      throw new UnauthorizedException('邮箱或密码错误');
    }
    this.throttle.clear(ip, email);

    if (this.requireEmailVerification() && !user.emailVerified && !user.isGuest) {
      throw new ForbiddenException('请先完成邮箱验证');
    }
    if (user.totpEnabled) {
      return {
        twoFactorRequired: true,
        challengeToken: this.signChallenge(user),
        user: this.profile(user),
      };
    }
    return this.issue(user);
  }

  verifyTwoFactor(challengeToken: string, code: string) {
    const user = this.verifyChallenge(challengeToken);
    const secret = this.store.getTotpSecret(user.id);
    if (!secret || !verifyTotp(secret, code)) {
      throw new UnauthorizedException('两步验证码错误');
    }
    return this.issue(user);
  }

  register(emailInput: string, passwordInput: string, nickname?: string) {
    const email = String(emailInput || '').trim();
    const password = String(passwordInput || '');
    if (!email || !email.includes('@')) throw new ConflictException('邮箱格式不正确');
    if (!password || password.length < 6) throw new ConflictException('密码至少 6 位');
    if (this.store.findByEmail(email)) throw new ConflictException('该邮箱已注册');
    const user = this.store.createUser({
      email,
      nickname: nickname || email.split('@')[0],
      password,
    });
    const verificationToken = this.issueVerificationToken(user);
    return {
      verificationRequired: true,
      email: user.email,
      ...(this.email.isDevExposeTokens() ? { devVerificationToken: verificationToken } : {}),
    };
  }

  guest() {
    const id = crypto.randomBytes(8).toString('hex');
    const user = this.store.createUser({
      email: `guest_${id}@guest.local`,
      nickname: `游客 ${id.slice(0, 6)}`,
      isGuest: true,
    });
    return this.issue(user);
  }

  async resendVerification(userId: string) {
    const user = this.store.findById(userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    if (user.emailVerified) return { verified: true };
    const token = this.issueVerificationToken(user);
    return {
      sent: true,
      ...(this.email.isDevExposeTokens() ? { devVerificationToken: token } : {}),
    };
  }

  async verifyEmail(token: string) {
    if (!token) throw new UnauthorizedException('验证链接无效');
    const user = this.store.findByVerificationToken(sha256(token));
    if (!user) throw new UnauthorizedException('验证链接无效或已过期');
    const verified = this.store.markEmailVerified(user.id);
    return { verified: true, user: verified ? this.profile(verified) : null };
  }

  async forgotPassword(emailInput: string) {
    const email = String(emailInput || '').trim();
    const user = this.store.findByEmail(email);
    if (!user) return { sent: true };
    const token = randomToken();
    this.store.setPasswordResetToken(
      user.id,
      sha256(token),
      new Date(Date.now() + RESET_TTL_MS).toISOString(),
    );
    await this.email.sendPasswordReset(user.email, token);
    return {
      sent: true,
      ...(this.email.isDevExposeTokens() ? { devResetToken: token } : {}),
    };
  }

  resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new ConflictException('密码至少 6 位');
    }
    const user = this.store.findByPasswordResetToken(sha256(token));
    if (!user) throw new UnauthorizedException('重置链接无效或已过期');
    this.store.updatePassword(user.id, newPassword);
    this.store.revokeAllForUser(user.id);
    return { reset: true };
  }

  setupTotp(userId: string) {
    const user = this.store.findById(userId);
    if (!user) throw new UnauthorizedException('用户不存在');
    if (user.totpEnabled) throw new ConflictException('两步验证已开启，请先关闭再重新设置');
    const secret = generateTotpSecret();
    this.store.setTotpSecret(user.id, secret);
    return {
      secret,
      otpauthUrl: otpauthUrl(user.email, secret),
    };
  }

  enableTotp(userId: string, code: string) {
    const secret = this.store.getTotpSecret(userId);
    if (!secret || !verifyTotp(secret, code)) {
      throw new UnauthorizedException('两步验证码错误');
    }
    const user = this.store.setTotpEnabled(userId, true);
    return { enabled: true, user: user ? this.profile(user) : null };
  }

  disableTotp(userId: string, code: string) {
    const secret = this.store.getTotpSecret(userId);
    if (!secret || !verifyTotp(secret, code)) {
      throw new UnauthorizedException('两步验证码错误');
    }
    const user = this.store.setTotpEnabled(userId, false);
    return { enabled: false, user: user ? this.profile(user) : null };
  }

  refresh(refreshToken: string) {
    const token = String(refreshToken || '');
    if (!token) throw new UnauthorizedException('缺少 refreshToken');
    const consumed = this.store.consumeRefreshToken(sha256(token));
    if (!consumed) throw new UnauthorizedException('refreshToken 无效或已过期');
    return this.issue(consumed.user);
  }

  logout(refreshToken?: string, userId?: string): void {
    if (refreshToken) this.store.revokeRefreshToken(sha256(refreshToken));
    if (userId) {
      // 立即踢下线：token_version 自增会让所有旧 access token 失效。
      this.store.revokeAllForUser(userId);
      this.store.bumpTokenVersion(userId);
    }
  }

  verifyAccessToken(token: string): AuthUser {
    const payload = this.verifyJwt(token, 'access');
    const user = this.store.findById(payload.sub);
    if (!user) throw new UnauthorizedException('用户不存在');
    if (Number(payload.ver) !== user.tokenVersion) {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
    return user;
  }

  private verifyChallenge(token: string): AuthUser {
    const payload = this.verifyJwt(token, '2fa');
    const user = this.store.findById(payload.sub);
    if (!user || !user.totpEnabled || Number(payload.ver) !== user.tokenVersion) {
      throw new UnauthorizedException('两步验证挑战已失效');
    }
    return user;
  }

  private verifyJwt(token: string, typ: AccessPayload['typ']): AccessPayload {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    const parts = raw.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('无效的访问令牌');

    const [header, payload, signature] = parts;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    let parsed: AccessPayload;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessPayload;
    } catch {
      throw new UnauthorizedException('无效的访问令牌');
    }
    if (parsed.typ !== typ || !parsed.sub || parsed.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('令牌已过期');
    }
    return parsed;
  }

  private issueVerificationToken(user: AuthUser): string {
    const token = randomToken();
    this.store.setVerificationToken(
      user.id,
      sha256(token),
      new Date(Date.now() + VERIFY_TTL_MS).toISOString(),
    );
    void this.email.sendVerification(user.email, token);
    return token;
  }

  private signChallenge(user: AuthUser): string {
    const now = Math.floor(Date.now() / 1000);
    return this.sign({
      sub: user.id,
      email: user.email,
      typ: '2fa',
      ver: user.tokenVersion,
      iat: now,
      exp: now + 5 * 60,
    });
  }

  private issue(user: AuthUser) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      typ: 'access',
      ver: user.tokenVersion,
      iat: now,
      exp: now + ACCESS_TTL_SECONDS,
    };
    const accessToken = this.sign(payload);

    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
    this.store.createRefreshToken(user.id, sha256(refreshToken), expiresAt);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_SECONDS,
      user: this.profile(user),
    };
  }

  private sign(payload: AccessPayload): string {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    return `${header}.${body}.${signature}`;
  }

  private requireEmailVerification(): boolean {
    return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === 'true';
  }

  profile(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      isSuper: user.isSuper,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.totpEnabled,
      guestExpiresAt: user.guestExpiresAt,
      defaultMode: 'simulation',
    };
  }
}
