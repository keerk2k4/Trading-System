import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { MockAuthService } from '../services/auth.service';
import { AUTH_API_BASE_URL, TRADE_API_BASE_URL } from '../api/api-clients';

// Auth-service endpoints that are called without a session. They must never
// carry a bearer token, and a 401 from them is a real answer, not an expired
// access token.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/admin/login', '/auth/register', '/auth/register/otp', '/auth/register/otp/verify', '/auth/forgot-password', '/auth/forgot-password/verify', '/auth/reset-password', '/auth/refresh', '/auth/logout', '/health'];

function needsBearerToken(url: string): boolean {
  if (url.startsWith(`${TRADE_API_BASE_URL}/`)) {
    return true;
  }
  if (url.startsWith(`${AUTH_API_BASE_URL}/`)) {
    return !PUBLIC_AUTH_PATHS.includes(url.slice(AUTH_API_BASE_URL.length));
  }
  return false;
}

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Adds `Authorization: Bearer <JWT>` to every request sent to the trade API
 * and to the protected auth-service endpoints (/auth/me, /kyc). The public
 * login/register/refresh calls and any other origin pass through untouched.
 *
 * A 401 on a protected request means the 15-minute access token has expired:
 * it is exchanged once via the refresh token and the request is retried. If
 * the refresh is refused the session is over and the user is sent to /login.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!needsBearerToken(req.url)) {
    return next(req);
  }

  const auth = inject(MockAuthService);
  const router = inject(Router);
  const token = auth.getToken();
  if (!token) {
    return next(req);
  }

  return next(withBearer(req, token)).pipe(
    catchError((err: unknown) => {
      const expired = err instanceof HttpErrorResponse && err.status === 401;
      if (!expired || !auth.getRefreshToken()) {
        return throwError(() => err);
      }

      return auth.refreshAccessToken().pipe(
        catchError(() => {
          // Already on a sign-in screen (login's own /auth/me lookup): that
          // screen reports the failure itself.
          const onAuthPage = /^\/(login|admin-login|register)\b/.test(router.url);
          if (!auth.isAuthenticated() && !onAuthPage) {
            router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          }
          return throwError(() => err);
        }),
        switchMap((newToken: string) => next(withBearer(req, newToken)))
      );
    })
  );
};
