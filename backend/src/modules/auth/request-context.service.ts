import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { AuthUser } from './auth.store';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<AuthUser>();

  enter(user: AuthUser): void {
    this.storage.enterWith(user);
  }

  current(): AuthUser | null {
    return this.storage.getStore() || null;
  }

  userId(): string {
    return this.storage.getStore()?.id || 'u_demo';
  }

  isSuper(): boolean {
    return Boolean(this.storage.getStore()?.isSuper);
  }

  isGuest(): boolean {
    return Boolean(this.storage.getStore()?.isGuest);
  }
}
