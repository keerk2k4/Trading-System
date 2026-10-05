import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { mockAdminGuard, mockAuthGuard } from './auth.guard';
import { MockAuthService } from '../services/auth.service';
import { routes } from '../../app.routes';

describe('mockAuthGuard', () => {
  let signedIn: boolean;
  let adminFromToken: boolean;

  beforeEach(() => {
    signedIn = false;
    adminFromToken = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: MockAuthService,
          useValue: {
            isAuthenticated: () => signedIn,
            // Guards must read the role from the JWT, never from the
            // `current_user` localStorage cache.
            isAdmin: () => adminFromToken,
            getCurrentUser: () => ({ id: 'u1', username: 'priya', accountId: 17, roles: ['CUSTOMER'] })
          }
        }
      ]
    });
  });

  const run = (url: string): MaybeAsync<GuardResult> =>
    TestBed.runInInjectionContext(() =>
      mockAuthGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    );

  it('blocks unauthenticated navigation and redirects to sign-in with the return address', () => {
    const result = run('/orders/history?status=FILLED');

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/login?returnUrl=%2Forders%2Fhistory%3Fstatus%3DFILLED'
    );
  });

  it('allows authenticated navigation', () => {
    signedIn = true;

    expect(run('/orders/history')).toBe(true);
  });

  it('sends a token-admin away from customer screens to the admin dashboard', () => {
    signedIn = true;
    adminFromToken = true;

    const result = run('/dashboard');
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/admin/dashboard');
  });

  it('mockAdminGuard blocks a spoofed localStorage ADMIN when the token is CUSTOMER', () => {
    // getCurrentUser() above still returns CUSTOMER here; even if an
    // attacker rewrote localStorage to ADMIN, isAdmin() (token) stays
    // false, so the admin route must redirect to /dashboard.
    signedIn = true;
    adminFromToken = false;

    const result = TestBed.runInInjectionContext(() =>
      mockAdminGuard({} as ActivatedRouteSnapshot, { url: '/admin/dashboard' } as RouterStateSnapshot)
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('mockAdminGuard allows a real token-admin', () => {
    signedIn = true;
    adminFromToken = true;

    const result = TestBed.runInInjectionContext(() =>
      mockAdminGuard({} as ActivatedRouteSnapshot, { url: '/admin/dashboard' } as RouterStateSnapshot)
    );

    expect(result).toBe(true);
  });

  it('guards every route except sign-in and sign-up', () => {
    const publicPaths = ['login', 'admin-login', 'register'];
    const unguarded = routes
      .filter((r: Route) => r.component && !publicPaths.includes(r.path ?? ''))
      .filter((r: Route) => !r.canActivate?.length)
      .map((r) => r.path);

    expect(unguarded).toEqual([]);
  });
});
