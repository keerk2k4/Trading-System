import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { MockAuthService } from '../services/mock-auth.service';

// `inject()` is required here, not `new MockAuthService()`/`new Router()` -
// constructing them manually bypasses Angular's DI, so MockAuthService never
// gets the HttpClient it now needs, and a manually-`new`'d Router has none
// of its own injected dependencies either.
//
// These guards are a usability control, not a security control: the bundle
// is public, and the Trade REST API authorises every call on its own. Their
// job is to send a signed-out visitor to sign-in (never to leave them on an
// empty screen) and remember where they were going.
//
// A redirect is returned as a UrlTree rather than via router.navigate() +
// `false`, so the router performs it as part of this same navigation.
export const mockAuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(MockAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    // Admins have no trading account or KYC, so the customer screens are not
    // theirs: send them to their own overview rather than the KYC form.
    // Role comes from the in-memory JWT (isAdmin), never from the
    // `current_user` localStorage entry, which the user can edit.
    if (authService.isAdmin()) {
      return router.createUrlTree(['/admin/dashboard']);
    }
    return true;
  }

  // Redirect to login with return URL
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const mockAdminGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(MockAuthService);
  const router = inject(Router);

  // Admins sign in through POST /auth/admin/login, so send them to that screen.
  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin-login'], { queryParams: { returnUrl: state.url } });
  }

  // Authorisation source of truth is the JWT `roles` claim read from the
  // in-memory access token (isAdmin). The `current_user` localStorage entry
  // is a display cache only and is deliberately ignored here, so changing
  // `"roles":["CUSTOMER"]` to `"roles":["ADMIN"]` in DevTools no longer
  // opens the admin dashboard.
  if (authService.isAdmin()) {
    return true;
  }

  // Redirect to dashboard if not admin
  return router.createUrlTree(['/dashboard']);
};
