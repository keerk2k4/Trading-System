import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, GuardResult, MaybeAsync, Route, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { mockAuthGuard } from './mock-auth.guard';
import { MockAuthService } from '../services/mock-auth.service';
import { routes } from '../../app.routes';

describe('mockAuthGuard', () => {
  let signedIn: boolean;

  beforeEach(() => {
    signedIn = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: MockAuthService,
          useValue: {
            isAuthenticated: () => signedIn,
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

  it('guards every route except sign-in and sign-up', () => {
    const publicPaths = ['login', 'admin-login', 'register'];
    const unguarded = routes
      .filter((r: Route) => r.component && !publicPaths.includes(r.path ?? ''))
      .filter((r: Route) => !r.canActivate?.length)
      .map((r) => r.path);

    expect(unguarded).toEqual([]);
  });
});
