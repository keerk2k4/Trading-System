import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { MockAuthService } from '../services/mock-auth.service';
import { TRADE_API_BASE_URL } from '../api/api-clients';

/**
 * Adds `Authorization: Bearer <JWT>` to every request sent to the trade API.
 * Requests to any other origin (the auth-service login/register/KYC calls)
 * pass through untouched, so their existing wiring is unaffected.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(`${TRADE_API_BASE_URL}/`)) {
    return next(req);
  }

  const token = inject(MockAuthService).getToken();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
