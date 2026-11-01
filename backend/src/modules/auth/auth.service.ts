import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuthStore, AuthUser } from './auth.store';

interface AccessPayload {
  sub: string;
  email: string;
  typ: 'access';
  iat: number;
  exp: number;
}

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

  constructor(private readonly store: AuthStore) {
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

  login(email: string, password: string) {
    const user = this.store.verifyLogin(email, password);
    if (!user) throw new UnauthorizedException('邮箱或密码错误');
    return this.issue(user);
  }

  register(email: string, password: string, nickname?: string) {
    if (!email || !email.includes('@')) throw new ConflictException('邮箱格式不正确');
    if (!password || password.length < 6) throw new ConflictException('密码至少 6 位');
    if (this.store.findByEmail(email)) throw new ConflictException('该邮箱已注册');
    const user = this.store.createUser({
      email,
      nickname: nickname || email.split('@')[0],
      password,
    });
    return this.issue(user);
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

  refresh(refreshToken: string) {
    const token = String(refreshToken || '');
    if (!token) throw new UnauthorizedException('缺少 refreshToken');
    const consumed = this.store.consumeRefreshToken(sha256(token));
    if (!consumed) throw new UnauthorizedException('refreshToken 无效或已过期');
    return this.issue(consumed.user);
  }

  logout(refreshToken?: string): void {
    if (refreshToken) this.store.revokeRefreshToken(sha256(refreshToken));
  }

  verifyAccessToken(token: string): AuthUser {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    const parts = raw.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('无效的访问令牌');

    const [header, payload, signature] = parts;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('无效的访问令牌');
    }

    let parsed: AccessPayload;
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessPayload;
    } catch {
      throw new UnauthorizedException('无效的访问令牌');
    }
    if (parsed.typ !== 'access' || !parsed.sub || parsed.exp * 1000 <= Date.now()) {
      throw new UnauthorizedException('访问令牌已过期');
    }

    const user = this.store.findById(parsed.sub);
    if (!user) throw new UnauthorizedException('用户不存在');
    return user;
  }

  private issue(user: AuthUser) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      typ: 'access',
      iat: now,
      exp: now + ACCESS_TTL_SECONDS,
    };
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    const accessToken = `${header}.${body}.${signature}`;

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

  profile(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      isGuest: user.isGuest,
      isSuper: user.isSuper,
      defaultMode: 'simulation',
    };
  }
}
