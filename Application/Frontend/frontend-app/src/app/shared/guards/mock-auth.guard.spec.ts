import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { mockAdminGuard, mockAuthGuard } from './mock-auth.guard';
import { MockAuthService } from '../services/mock-auth.service';
import { routes } from '../../app.routes';

describe('auth guards', () => {
  let signedIn: boolean;
  let roles: string[];

  beforeEach(() => {
    signedIn = false;
    roles = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: MockAuthService,
          useValue: {
            isAuthenticated: () => signedIn,
            getCurrentUser: () => ({ id: 'u1', username: 'priya', accountId: 17, roles })
          }
        }
      ]
    });
  });

  const run = (guard: typeof mockAuthGuard, url: string): MaybeAsync<GuardResult> =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    );

  const redirectOf = (result: MaybeAsync<GuardResult>): string => {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  };

  describe('mockAuthGuard', () => {
    it('blocks unauthenticated navigation and redirects to sign-in with the return address', () => {
      const result = run(mockAuthGuard, '/orders/history?status=FILLED');

      expect(redirectOf(result)).toBe('/login?returnUrl=%2Forders%2Fhistory%3Fstatus%3DFILLED');
    });

    it('allows authenticated navigation', () => {
      signedIn = true;

      expect(run(mockAuthGuard, '/orders/history')).toBe(true);
    });
  });

  describe('mockAdminGuard', () => {
    it('blocks unauthenticated navigation and redirects to admin sign-in with the return address', () => {
      const result = run(mockAdminGuard, '/admin/kyc-review');

      expect(redirectOf(result)).toBe('/admin-login?returnUrl=%2Fadmin%2Fkyc-review');
    });

    it('allows an authenticated admin', () => {
      signedIn = true;
      roles = ['ADMIN'];

      expect(run(mockAdminGuard, '/admin/kyc-review')).toBe(true);
    });

    it('sends an authenticated non-admin to their dashboard', () => {
      signedIn = true;
      roles = ['CUSTOMER'];

      expect(redirectOf(run(mockAdminGuard, '/admin/kyc-review'))).toBe('/dashboard');
    });
  });

  describe('route table', () => {
    const publicPaths = ['login', 'admin-login', 'register'];

    it('guards every route except sign-in and sign-up', () => {
      const unguarded = routes
        .filter((r: Route) => r.component && !publicPaths.includes(r.path ?? ''))
        .filter((r: Route) => !r.canActivate?.length)
        .map((r) => r.path);

      expect(unguarded).toEqual([]);
    });
  });
});
