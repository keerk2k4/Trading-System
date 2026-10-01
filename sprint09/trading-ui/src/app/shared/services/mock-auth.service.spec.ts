import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AUTH_API_BASE_URL, MockAuthService } from './mock-auth.service';
import { TRADE_API_BASE_URL } from './trade-api.service';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { AuthError, AuthResponse } from '../models/auth.models';

// Builds an unsigned JWT whose payload is base64url, like the real tokens.
function jwt(claims: object): string {
  const payload = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
}

const CUSTOMER_TOKEN = jwt({ sub: 'user-1', accountId: 6, roles: ['CUSTOMER'] });
const TOKENS = { accessToken: CUSTOMER_TOKEN, refreshToken: 'refresh-1', tokenType: 'Bearer', expiresIn: 900 };
const UNAUTHORISED = { errorCode: 'AUTH-401', message: 'Unauthorised' };

describe('MockAuthService', () => {
  let service: MockAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authTokenInterceptor])), provideHttpClientTesting()]
    });
    service = TestBed.inject(MockAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('registers with only the username and password and does not sign the user in', () => {
    service.register({ username: 'gaurang123', password: 'correct horse battery staple' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/register`);
    expect(req.request.body).toEqual({ username: 'gaurang123', password: 'correct horse battery staple' });
    req.flush({ id: 'user-1', username: 'gaurang123', roles: ['CUSTOMER'] });

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('stores both tokens on login and loads the user from /auth/me', () => {
    let response: AuthResponse | undefined;
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe((r) => (response = r));

    const login = http.expectOne(`${AUTH_API_BASE_URL}/auth/login`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush(TOKENS);

    const me = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${CUSTOMER_TOKEN}`);
    me.flush({ id: 'user-1', username: 'Gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const user = { id: 'user-1', username: 'Gaurang123', accountId: 6, roles: ['CUSTOMER'] };
    expect(response?.user).toEqual(user);
    expect(service.getCurrentUser()).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getToken()).toBe(CUSTOMER_TOKEN);
    expect(service.getRefreshToken()).toBe('refresh-1');
  });

  it('falls back to the token claims when /auth/me is unavailable', () => {
    let response: AuthResponse | undefined;
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe((r) => (response = r));

    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(TOKENS);
    http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush(null, { status: 500, statusText: 'Server Error' });

    expect(response?.user).toEqual({ id: 'user-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });
  });

  it('signs an admin in through /auth/admin/login', () => {
    const adminToken = jwt({ sub: 'admin-1', accountId: 0, roles: ['ADMIN'] });
    service.login({ username: 'ops', password: 'pw' }, true).subscribe();

    http.expectOne(`${AUTH_API_BASE_URL}/auth/admin/login`).flush({ ...TOKENS, accessToken: adminToken });
    http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush({ id: 'admin-1', username: 'ops', accountId: 0, roles: ['ADMIN'] });

    expect(service.isAdmin()).toBe(true);
  });

  it('rethrows a refused login as { errorCode, message, status } and stores nothing', () => {
    let error: AuthError | undefined;
    service.login({ username: 'gaurang123', password: 'wrong' }).subscribe({ error: (e) => (error = e) });

    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });

    expect(error).toEqual({ ...UNAUTHORISED, status: 401 });
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getRefreshToken()).toBeNull();
  });

  it('reports status 0 when the auth service is unreachable', () => {
    let error: AuthError | undefined;
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe({ error: (e) => (error = e) });

    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).error(new ProgressEvent('error'));

    expect(error?.status).toBe(0);
    expect(error?.errorCode).toBe('');
  });

  it('clears the whole session on logout', () => {
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe();
    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(TOKENS);
    http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush({ id: 'user-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  describe('when the access token has expired', () => {
    const balanceUrl = `${TRADE_API_BASE_URL}/api/v1/accounts/6/balance`;
    const positionsUrl = `${TRADE_API_BASE_URL}/api/v1/accounts/6/positions`;
    let client: HttpClient;

    beforeEach(() => {
      client = TestBed.inject(HttpClient);
      service.login({ username: 'gaurang123', password: 'pw' }).subscribe();
      http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(TOKENS);
      http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush({ id: 'user-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });
    });

    it('refreshes once for concurrent requests and retries them with the new token', () => {
      const results: unknown[] = [];
      client.get(balanceUrl).subscribe((r) => results.push(r));
      client.get(positionsUrl).subscribe((r) => results.push(r));

      http.expectOne(balanceUrl).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });
      http.expectOne(positionsUrl).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });

      const refresh = http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`);
      expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      refresh.flush({ ...TOKENS, accessToken: 'new-access', refreshToken: 'refresh-2' });

      const balance = http.expectOne(balanceUrl);
      const positions = http.expectOne(positionsUrl);
      expect(balance.request.headers.get('Authorization')).toBe('Bearer new-access');
      expect(positions.request.headers.get('Authorization')).toBe('Bearer new-access');
      balance.flush({ cash: 100 });
      positions.flush([]);

      expect(results).toEqual([{ cash: 100 }, []]);
      expect(service.getRefreshToken()).toBe('refresh-2');
    });

    it('ends the session and returns to /login when the refresh is refused', () => {
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      let error: unknown;
      client.get(balanceUrl).subscribe({ error: (e) => (error = e) });

      http.expectOne(balanceUrl).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });
      http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });

      expect(error).toBeDefined();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.getRefreshToken()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
    });
  });
});
