import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { User, AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.models';
import { Observable } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

// Base URL of the real Sprint 8/9 auth-service. This service used to be
// fully in-memory ("Mock"); register/login/submitKyc now call the real
// backend below. The name is kept as MockAuthService (rather than renamed)
// because several other, out-of-scope screens (dashboard, admin-dashboard,
// place-order) already inject it purely for getCurrentUser()/isAuthenticated(),
// and changing the class/file name would touch those unrelated files too.
const AUTH_API_BASE_URL = 'http://localhost:3000';

@Injectable({
  providedIn: 'root'
})
export class MockAuthService {
  private currentUser = signal<User | null>(this.loadFromStorage());
  public currentUser$ = this.currentUser.asReadonly();

  constructor(private http: HttpClient) {}

  // Real backend: POST /auth/register -> { id, username, roles }.
  // No tokens and no accountId come back here - registration only creates
  // the user; the trading account is provisioned asynchronously afterwards.
  register(data: RegisterRequest): Observable<any> {
    return this.http
      .post(`${AUTH_API_BASE_URL}/auth/register`, {
        username: data.username,
        password: data.password,
      })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Real backend: POST /auth/login (or /auth/admin/login for the admin
  // sign-in screen) -> { accessToken, refreshToken, tokenType, expiresIn }.
  // There is no embedded `user` object in the real response, so it's
  // reconstructed here from the JWT's own claims (sub/accountId/roles),
  // keeping the same AuthResponse shape the rest of the app already expects.
  login(data: LoginRequest, asAdmin = false): Observable<AuthResponse> {
    const endpoint = asAdmin ? 'admin/login' : 'login';
    return this.http
      .post<Omit<AuthResponse, 'user'>>(`${AUTH_API_BASE_URL}/auth/${endpoint}`, {
        username: data.username,
        password: data.password,
      })
      .pipe(
        map((tokens) => {
          const payload = this.decodeToken(tokens.accessToken);
          const user: User = {
            id: payload?.sub,
            username: data.username,
            accountId: payload?.accountId ?? 0,
            roles: payload?.roles ?? [],
          };
          return { ...tokens, user } as AuthResponse;
        }),
        tap((response) => {
          this.storeToLocalStorage(response);
          this.currentUser.set(response.user);
        }),
        catchError((err) => this.rethrowServerError(err))
      );
  }

  // Angular wraps a failed HTTP call in HttpErrorResponse, with the
  // server's actual JSON body (e.g. { errorCode, message }) under `.error`.
  // Rethrowing just that inner body keeps every existing component's
  // `err.errorCode` handling working unchanged, matching what the old
  // in-memory mock threw directly.
  private rethrowServerError(err: HttpErrorResponse): Observable<never> {
    throw err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' };
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('kyc_status');
    this.currentUser.set(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser();
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return !!token;
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  // Decode JWT token to extract payload
  decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const decoded = JSON.parse(atob(parts[1]));
      return decoded;
    } catch (error) {
      console.error('Error decoding token:', error);
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

  private storeToLocalStorage(response: AuthResponse): void {
    localStorage.setItem('auth_token', response.accessToken);
    localStorage.setItem('current_user', JSON.stringify(response.user));
  }

  private loadFromStorage(): User | null {
    const stored = localStorage.getItem('current_user');
    return stored ? JSON.parse(stored) : null;
  }
}
