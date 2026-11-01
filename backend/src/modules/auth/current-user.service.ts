import { Injectable } from '@nestjs/common';

export interface CurrentUser {
  id: string;
  email: string;
  nickname: string;
  isSuper: boolean;
}

const SUPER_PATTERN = /(^|[._@-])(kaser|super|admin)/i;

function decodeMockToken(token?: string): string | null {
  if (!token) return null;
  const raw = token.replace(/^Bearer\s+/i, '').trim();
  if (!raw.startsWith('mock.')) return null;
  try {
    return Buffer.from(raw.slice(5), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * 一期仍是 Mock 登录，但身份从 token 解析，避免继续把所有请求都当成 demo 用户。
 * ISSUE-05 接入真实 JWT 后，只需要替换这里的 resolve 实现。
 */
@Injectable()
export class CurrentUserService {
  resolve(authorization?: string): CurrentUser {
    const email = decodeMockToken(authorization) || 'demo@test.com';
    const normalized = email.toLowerCase();
    const envSupers = String(process.env.SUPER_ACCOUNT_EMAILS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const isSuper = SUPER_PATTERN.test(normalized) || envSupers.includes(normalized);

    return {
      id: this.idOf(normalized),
      email,
      nickname: isSuper ? 'Super Admin' : 'Demo User',
      isSuper,
    };
  }

  createMockToken(email: string): string {
    return `mock.${Buffer.from(email, 'utf8').toString('base64url')}`;
  }

  private idOf(email: string): string {
    let hash = 0;
    for (let index = 0; index < email.length; index += 1) {
      hash = (hash * 31 + email.charCodeAt(index)) >>> 0;
    }
    return `u_${hash.toString(16)}`;
  }
}
