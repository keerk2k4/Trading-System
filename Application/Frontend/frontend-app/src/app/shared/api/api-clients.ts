import { EnvironmentProviders } from '@angular/core';
import { provideApi as provideAuthApi } from '../../../generated/auth-client';
import { provideApi as provideTradeApi } from '../../../generated/trade-client';
import { environment } from '../../../environments/environment';
import { accessTokenStore } from '../services/access-token.store';

// The only place the app configures the generated OpenAPI clients
// (src/generated/, never edited by hand). Services under shared/services/
// wrap those clients; components never import from src/generated/ directly.

// Set per build in src/environments/.
export const AUTH_API_BASE_URL = environment.AUTH_API_BASE_URL;
export const TRADE_API_BASE_URL = environment.TRADE_API_BASE_URL;

// Read on every request, so a token obtained after login or refresh is picked
// up without re-creating the clients. In memory only, never localStorage.
const readAccessToken = (): string | undefined => accessTokenStore() ?? undefined;

export function provideApiClients(): EnvironmentProviders[] {
  return [
    // The auth client adds `Authorization: Bearer <token>` itself, but only on
    // operations the contract marks as secured (/kyc, /auth/me), never on
    // register/login/refresh. withCredentials lets the browser store and send
    // the HttpOnly refresh_token cookie (Path=/auth) on these cross-origin calls.
    provideAuthApi({
      basePath: AUTH_API_BASE_URL,
      credentials: { bearerAuth: readAccessToken },
      withCredentials: true
    }),
    // Trade API requests get their bearer token from authTokenInterceptor.
    provideTradeApi(TRADE_API_BASE_URL),
  ];
}
