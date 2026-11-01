import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil: number;
}

const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_EMAIL_FAILURES = 5;
const MAX_IP_FAILURES = 30;

@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, Attempt>();

  check(ip: string, email: string): void {
    this.assertKey(`ip:${ip}`, MAX_IP_FAILURES);
    this.assertKey(`email:${ip}:${email.toLowerCase()}`, MAX_EMAIL_FAILURES);
  }

  recordFailure(ip: string, email: string): void {
    this.bump(`ip:${ip}`, MAX_IP_FAILURES);
    this.bump(`email:${ip}:${email.toLowerCase()}`, MAX_EMAIL_FAILURES);
  }

  clear(ip: string, email: string): void {
    this.attempts.delete(`email:${ip}:${email.toLowerCase()}`);
  }

  private assertKey(key: string, max: number): void {
    const attempt = this.attempts.get(key);
    if (!attempt) return;
    const now = Date.now();
    if (attempt.blockedUntil > now) {
      throw new HttpException('登录尝试过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (now - attempt.firstAt > WINDOW_MS) {
      this.attempts.delete(key);
      return;
    }
    if (attempt.count >= max) {
      attempt.blockedUntil = now + BLOCK_MS;
      throw new HttpException('登录尝试过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private bump(key: string, max: number): void {
    const now = Date.now();
    const attempt = this.attempts.get(key);
    if (!attempt || now - attempt.firstAt > WINDOW_MS) {
      this.attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
      return;
    }
    attempt.count += 1;
    if (attempt.count >= max) attempt.blockedUntil = now + BLOCK_MS;
  }
}
