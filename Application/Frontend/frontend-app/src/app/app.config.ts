import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authTokenInterceptor } from './shared/interceptors/auth-token.interceptor';
import { provideApiClients } from './shared/api/api-clients';
import { MockAuthService } from './shared/services/mock-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authTokenInterceptor])),
    ...provideApiClients(),
    // The access token is held in memory only, so a reload starts without
    // one. Before the first route is guarded, swap the HttpOnly refresh
    // cookie for a new access token once; restoreSession() never fails boot.
    provideAppInitializer(() => inject(MockAuthService).restoreSession())
  ]
};
