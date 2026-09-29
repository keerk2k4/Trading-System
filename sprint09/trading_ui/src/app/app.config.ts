import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

/**
 * NOTE for the "Bearer Token Interceptor" story: when that interceptor is
 * built, register it here as `provideHttpClient(withInterceptors([authInterceptor]))`
 * — a functional interceptor registered exactly once, which is the
 * acceptance criterion. Nothing else in this file should ever set an
 * Authorization header.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
  ],
};
