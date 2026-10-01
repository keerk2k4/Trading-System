import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  AuthError,
  AuthResponse,
  ErrorResponse,
  LoginRequest,
  RegisterRequest,
  TokenPayload,
  TokenResponse,
  User,
  UserResponseData
} from '../models/auth.models';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';

// Base URL of the real Sprint 8/9 auth-service. This service used to be
// fully in-memory ("Mock"); register/login/submitKyc now call the real
// backend below. The name is kept as MockAuthService (rather than renamed)
// because several other, out-of-scope screens (dashboard, admin-dashboard,
// place-order) already inject it purely for getCurrentUser()/isAuthenticated(),
// and changing the class/file name would touch those unrelated files too.
export const AUTH_API_BASE_URL = 'http://localhost:3000';

const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const CURRENT_USER_KEY = 'current_user';
const KYC_STATUS_KEY = 'kyc_status';

const UNAUTHORISED: AuthError = { errorCode: 'AUTH-401', message: 'Unauthorised', status: 401 };

@Injectable({
  providedIn: 'root'
})
export class MockAuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  private readonly currentUser = signal<User | null>(this.loadUserFromStorage());
  public readonly currentUser$ = this.currentUser.asReadonly();
  public readonly authenticated = computed(() => this.accessToken() !== null);

  // The refresh token is single-use: the backend rotates it on every refresh
  // and treats a second presentation as theft. Requests that fail together
  // (e.g. the dashboard's three calls) must therefore share one refresh.
  private refreshInFlight: Observable<string> | null = null;

  // Real backend: POST /auth/register -> { id, username, roles }.
  // No tokens and no accountId come back here - registration only creates
  // the user; the trading account is provisioned asynchronously afterwards.
  register(data: RegisterRequest): Observable<UserResponseData> {
    return this.http
      .post<UserResponseData>(`${AUTH_API_BASE_URL}/auth/register`, {
        username: data.username,
        password: data.password,
        email: data.email,
      })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Real backend: POST /auth/login (or /auth/admin/login for the admin
  // sign-in screen) -> { accessToken, refreshToken, tokenType, expiresIn }.
  // There is no embedded `user` object in the real response. The user is
  // first reconstructed from the JWT's own claims (sub/accountId/roles) so
  // the session is usable straight away, then replaced by GET /auth/me.
  login(data: LoginRequest, asAdmin = false): Observable<AuthResponse> {
    const endpoint = asAdmin ? 'admin/login' : 'login';
    return this.http
      .post<TokenResponse>(`${AUTH_API_BASE_URL}/auth/${endpoint}`, {
        username: data.username,
        password: data.password,
      })
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
  // authTokenInterceptor adds the Authorization header.
  loadCurrentUser(): Observable<User> {
    return this.http.get<User>(`${AUTH_API_BASE_URL}/auth/me`).pipe(
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

  // Real backend: POST /auth/refresh -> a new token pair. Emits the new
  // access token. A refused refresh means the session is over, so it is
  // cleared; a request that never reached the backend leaves it alone.
  refreshAccessToken(): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => UNAUTHORISED);
    }

    this.refreshInFlight ??= this.http
      .post<TokenResponse>(`${AUTH_API_BASE_URL}/auth/refresh`, { refreshToken })
      .pipe(
        tap((tokens) => this.storeTokens(tokens)),
        map((tokens) => tokens.accessToken),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 401) {
            this.logout();
          }
          return this.rethrowServerError(err);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1)
      );
    return this.refreshInFlight;
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

  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(KYC_STATUS_KEY);
    this.accessToken.set(null);
    this.currentUser.set(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser();
  }

  isAuthenticated(): boolean {
    return this.authenticated();
  }

  getToken(): string | null {
    return this.accessToken();
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
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

  // Get roles from current token
  getRolesFromToken(): string[] {
    const token = this.getToken();
    if (!token) {
      return [];
    }
    const payload = this.decodeToken(token);
    return payload?.roles || [];
  }

  // Check if user is admin
  isAdmin(): boolean {
    const roles = this.getRolesFromToken();
    return roles.includes('ADMIN');
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

  private storeTokens(tokens: TokenResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    this.accessToken.set(tokens.accessToken);
  }

  private setCurrentUser(user: User): void {
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
}
