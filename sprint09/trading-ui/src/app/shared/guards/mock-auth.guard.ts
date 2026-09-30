import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { MockAuthService } from '../services/mock-auth.service';

// `inject()` is required here, not `new MockAuthService()`/`new Router()` -
// constructing them manually bypasses Angular's DI, so MockAuthService never
// gets the HttpClient it now needs, and a manually-`new`'d Router has none
// of its own injected dependencies either.
export const mockAuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(MockAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login with return URL
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const mockAdminGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(MockAuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const user = authService.getCurrentUser();
  if (user && user.roles.includes('ADMIN')) {
    return true;
  }

  // Redirect to dashboard if not admin
  return router.createUrlTree(['/dashboard']);
};
