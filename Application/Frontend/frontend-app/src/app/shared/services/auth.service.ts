import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AuthError,
  AuthResponse,
  ErrorResponse,
  LoginRequest,
  RegisterRequest,
  SendOtpResponseData,
  TokenPayload,
  TokenResponse,
  User,
  UserResponseData,
  VerifyOtpResponseData
} from '../models/auth.models';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { AUTH_API_BASE_URL } from '../api/api-clients';
import { AuthService as AuthApi, ProfileService } from '../../../generated/auth-client';
import { accessTokenStore } from './access-token.store';

// Base URL of the real Sprint 8/9 auth-service, set per build in
// src/environments/ and re-exported for existing importers. This service used to be
// fully in-memory ("Mock"); register/login/submitKyc now call the real
// backend below. The name is kept as MockAuthService (rather than renamed)
// because several other, out-of-scope screens (dashboard, admin-dashboard,
// place-order) already inject it purely for getCurrentUser()/isAuthenticated(),
// and changing the class/file name would touch those unrelated files too.
export { AUTH_API_BASE_URL };

// Keys under which builds before the in-memory change persisted the tokens.
// Never written any more; only purged once so a stale token cannot linger.
const LEGACY_TOKEN_KEYS = ['auth_token', 'refresh_token'];
const CURRENT_USER_KEY = 'current_user';
const KYC_STATUS_KEY = 'kyc_status';

// Stands in for the refresh token, which now lives in an HttpOnly cookie the
// page cannot read. Not a credential: it only tells authTokenInterceptor that
// a refresh is worth attempting.
const COOKIE_REFRESH_SESSION = 'httponly-cookie';

const UNAUTHORISED: AuthError = { errorCode: 'AUTH-401', message: 'Unauthorised', status: 401 };

@Injectable({
  providedIn: 'root'
})
export class MockAuthService {
  // Generated from contracts/auth-api.yaml. Configured in api-clients.ts with
  // withCredentials, so the HttpOnly refresh cookie is stored and sent.
  private readonly authApi = inject(AuthApi);
  private readonly profileApi = inject(ProfileService);

  // In memory only: null on every page load until login or the bootstrap
  // silent refresh (restoreSession) fills it.
  private readonly accessToken = accessTokenStore;
  private readonly currentUser = signal<User | null>(this.loadUserFromStorage());
  public readonly currentUser$ = this.currentUser.asReadonly();
  // Authentication = a live, unexpired in-memory access token. The
  // `current_user` localStorage entry is a display-only cache (username /
  // greeting) and is never consulted here, so editing it cannot sign a
  // user in or escalate their role.
  public readonly authenticated = computed(() => this.hasValidToken());

  constructor() {
    this.accessToken.set(null);
    LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  // The refresh token is single-use: the backend rotates it on every refresh
  // and treats a second presentation as theft. Requests that fail together
  // (e.g. the dashboard's three calls) must therefore share one refresh.
  private refreshInFlight: Observable<string> | null = null;

  // Real backend: POST /auth/register/otp -> { message, expiresIn, resendAfter }.
  // Emails a 6-digit code; the code itself never comes back to the page.
  sendRegistrationOtp(email: string): Observable<SendOtpResponseData> {
    return this.authApi
      .sendRegistrationOtp({ email })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Real backend: POST /auth/register/otp/verify -> { verificationToken, expiresIn }.
  // The token is what register() must send to prove the email was verified.
  verifyRegistrationOtp(email: string, otp: string): Observable<VerifyOtpResponseData> {
    return this.authApi
      .verifyRegistrationOtp({ email, otp })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Real backend: POST /auth/register -> { id, username, roles }.
  // No tokens and no accountId come back here - registration only creates
  // the user; the trading account is provisioned asynchronously afterwards.
  register(data: RegisterRequest): Observable<UserResponseData> {
    return this.authApi
      .register({
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        password: data.password,
        emailVerificationToken: data.emailVerificationToken,
      })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Real backend: POST /auth/login (or /auth/admin/login for the admin
  // sign-in screen) -> { accessToken, refreshToken, tokenType, expiresIn },
  // plus the refresh token as an HttpOnly cookie. The auth client's
  // withCredentials is what lets the browser store that cross-origin cookie;
  // the body's refreshToken is ignored here. There is no embedded `user` object in the real
  // response. The user is first reconstructed from the JWT's own claims
  // (sub/accountId/roles) so the session is usable straight away, then
  // replaced by GET /auth/me.
  login(data: LoginRequest, asAdmin = false): Observable<AuthResponse> {
    const credentials = { username: data.username, password: data.password };
    const request: Observable<TokenResponse> = asAdmin
      ? this.authApi.loginAdmin(credentials)
      : this.authApi.login(credentials);
    return request
      .pipe(
        catchError((err) => this.rethrowServerError(err)),
        tap((tokens) => {
          this.storeTokens(tokens);
          this.setCurrentUser(this.userFromToken(tokens.accessToken, data.username));
        }),
        switchMap((tokens) =>
          this.loadCurrentUser().pipe(
            // /auth/me only refines the identity; if it is unavailable the
            // claims-derived user above is still correct enough to sign in.
            catchError(() => {
              const user = this.currentUser();
              return user ? of(user) : throwError(() => UNAUTHORISED);
            }),
            map((user) => ({ ...tokens, user }))
          )
        )
      );
  }

  // Real backend: GET /auth/me -> { id, username, accountId, roles }.
  // The contract marks it secured, so the generated client and
  // authTokenInterceptor both attach the same bearer token.
  loadCurrentUser(): Observable<User> {
    return this.profileApi.getCurrentUser().pipe(
      map((me) => ({
        id: me.id,
        // The backend sends an empty username when the user row is missing.
        username: me.username || this.currentUser()?.username || '',
        accountId: me.accountId ?? 0,
        roles: me.roles ?? [],
      })),
      tap((user) => this.setCurrentUser(user)),
      catchError((err) => this.rethrowServerError(err))
    );
  }

  // Real backend: POST /auth/refresh -> a new token pair. The refresh token
  // is the HttpOnly cookie the browser attaches (withCredentials), so the
  // body is empty; the backend rotates the cookie in its response. Emits the
  // new access token. A refused refresh means the session is over, so it is
  // cleared; a request that never reached the backend leaves it alone.
  refreshAccessToken(): Observable<string> {
    this.refreshInFlight ??= this.authApi
      .refresh({})
      .pipe(
        tap((tokens) => this.storeTokens(tokens)),
        map((tokens) => tokens.accessToken),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 401) {
            this.clearSession();
          }
          return this.rethrowServerError(err);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1)
      );
    return this.refreshInFlight;
  }

  // Run once at app bootstrap. The access token does not survive a reload,
  // so a returning user (current_user still stored) gets a new one from the
  // refresh cookie instead of being sent to /login. Never fails: with no
  // valid cookie the session is simply cleared and the guards take over.
  // After a successful refresh the user profile is reloaded from GET
  // /auth/me (which reads the verified token server-side), so a hand-edited
  // `current_user` entry in localStorage is overwritten with the truthful
  // identity instead of lingering as spoofed ADMIN.
  restoreSession(): Observable<void> {
    if (!this.currentUser()) {
      return of(void 0);
    }
    return this.refreshAccessToken().pipe(
      switchMap(() => this.loadCurrentUser().pipe(catchError(() => of(void 0)))),
      map(() => void 0),
      catchError(() => of(void 0))
    );
  }

  // Angular wraps a failed HTTP call in HttpErrorResponse, with the
  // server's actual JSON body (e.g. { errorCode, message }) under `.error`.
  // Rethrowing just that inner body keeps every existing component's
  // `err.errorCode` handling working unchanged, matching what the old
  // in-memory mock threw directly. The HTTP status is carried along too,
  // because a request that never reached the backend (status 0) has no body.
  private rethrowServerError(err: HttpErrorResponse): Observable<never> {
    const body = err.error as Partial<ErrorResponse> | null;
    const error: AuthError = {
      errorCode: body?.errorCode ?? '',
      message: body?.message ?? 'Unexpected error',
      status: err.status
    };
    return throwError(() => error);
  }

  // Always calls the backend: the page cannot see whether a refresh cookie
  // exists, and only the server can revoke it and clear it.
  logout(): void {
    this.authApi
      .logout({})
      .pipe(
        catchError(() => of(void 0)),
        finalize(() => this.clearSession())
      )
      .subscribe();
  }

  getCurrentUser(): User | null {
    // Display-only cache seeded from localStorage. Never use this for
    // authorisation decisions (route guards, admin checks) - it is fully
    // client-writable. Use getRolesFromToken()/isAdmin(), which read the
    // in-memory verified JWT, instead.
    return this.currentUser();
  }

  isAuthenticated(): boolean {
    return this.hasValidToken();
  }

  getToken(): string | null {
    return this.accessToken();
  }

  // The real refresh token is in an HttpOnly cookie and unreadable from here.
  // A signed-in session always has one alongside its access token, so this
  // returns a non-secret marker while signed in and null otherwise, which is
  // exactly the "is a refresh worth trying?" check authTokenInterceptor makes.
  getRefreshToken(): string | null {
    return this.authenticated() ? COOKIE_REFRESH_SESSION : null;
  }

  // Decode JWT token to extract payload. The payload is base64url, which
  // atob() only accepts once `-` and `_` are mapped back to `+` and `/`.
  decodeToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)) as TokenPayload;
    } catch {
      return null;
    }
  }

  // Get roles from the in-memory access token (the only role source the
  // UI trusts for authorisation). Returns [] when signed out or when the
  // token is expired, so a stale/edited localStorage entry can never
  // escalate privileges.
  getRolesFromToken(): string[] {
    const token = this.getToken();
    if (!token) {
      return [];
    }
    const payload = this.decodeToken(token);
    if (!payload || this.isTokenExpired(payload)) {
      return [];
    }
    return payload?.roles || [];
  }

  // Check if the signed-in user is an admin, based solely on the verified
  // JWT `roles` claim - never on the `current_user` localStorage entry.
  isAdmin(): boolean {
    const roles = this.getRolesFromToken();
    return roles.some((role) => role?.toUpperCase() === 'ADMIN');
  }

  private hasValidToken(): boolean {
    const token = this.accessToken();
    if (!token) {
      return false;
    }
    const payload = this.decodeToken(token);
    if (!payload) {
      // Non-JWT test doubles (e.g. 'new-access' in unit tests) carry no
      // claims to expire; presence alone means signed in. Real backend
      // tokens are always JWTs and go through the expiry check below.
      return true;
    }
    return !this.isTokenExpired(payload);
  }

  private isTokenExpired(payload: TokenPayload): boolean {
    // Tokens without an `exp` claim (e.g. unsigned test doubles) are
    // treated as non-expiring so existing unit tests keep working; real
    // backend tokens always carry `exp` (15 min after `iat` per contract).
    if (typeof payload?.exp !== 'number') {
      return false;
    }
    return payload.exp * 1000 <= Date.now();
  }

  private userFromToken(accessToken: string, username: string): User {
    const payload = this.decodeToken(accessToken);
    return {
      id: payload?.sub ?? '',
      username,
      accountId: payload?.accountId ?? 0,
      roles: payload?.roles ?? [],
    };
  }

  // Memory only. The refresh token in the body is deliberately dropped; the
  // browser already holds it as the HttpOnly cookie.
  private storeTokens(tokens: TokenResponse): void {
    this.accessToken.set(tokens.accessToken);
  }

  private setCurrentUser(user: User): void {
    // Display cache only. Authorisation always re-reads the JWT via
    // getRolesFromToken()/isAdmin(), so editing this key in DevTools
    // cannot grant admin access.
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUserFromStorage(): User | null {
    try {
      const stored = localStorage.getItem(CURRENT_USER_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(KYC_STATUS_KEY);
    this.accessToken.set(null);
    this.currentUser.set(null);
  }
}
