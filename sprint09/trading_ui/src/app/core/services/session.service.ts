import { Injectable, computed, signal } from '@angular/core';
import { UserResponse } from '../models/auth.models';

const ACCESS_TOKEN_KEY = 'trading_ui.accessToken';
const REFRESH_TOKEN_KEY = 'trading_ui.refreshToken';

/**
 * Minimal session/token store, signal-based, backed by localStorage so a
 * page refresh doesn't silently sign the user out.
 *
 * This is NOT the "Bearer Token Interceptor" story. It only holds the token;
 * it does not attach it to outgoing requests. That deliverable is a single
 * functional interceptor, registered once in `provideHttpClient(withInterceptors([...]))`,
 * that decides whether to attach the header by comparing the outgoing URL
 * against a configured allow-list of your own platform origins — with two
 * named unit tests (the attach case, the do-not-attach case). Build that
 * separately; today the KYC screen attaches its own header directly (see
 * KycApiService), as a stopgap.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly accessTokenSignal = signal<string | null>(this.readStored(ACCESS_TOKEN_KEY));
  private readonly refreshTokenSignal = signal<string | null>(this.readStored(REFRESH_TOKEN_KEY));

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly isSignedIn = computed(() => this.accessTokenSignal() !== null);

  setTokens(tokens: { accessToken: string; refreshToken: string }): void {
    this.accessTokenSignal.set(tokens.accessToken);
    this.refreshTokenSignal.set(tokens.refreshToken);
    this.writeStored(ACCESS_TOKEN_KEY, tokens.accessToken);
    this.writeStored(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  clear(): void {
    this.accessTokenSignal.set(null);
    this.refreshTokenSignal.set(null);
    this.removeStored(ACCESS_TOKEN_KEY);
    this.removeStored(REFRESH_TOKEN_KEY);
  }

  private readStored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStored(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable (private browsing, blocked cookies) — the
      // in-memory signal still works for the rest of this tab's session.
    }
  }

  private removeStored(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
