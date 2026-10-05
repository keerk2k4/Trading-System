import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AUTH_API_BASE_URL, MockAuthService } from './auth.service';
import { TRADE_API_BASE_URL } from './trade-api.service';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { provideApiClients } from '../api/api-clients';
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
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        // Configure the generated clients exactly as app.config.ts does.
        ...provideApiClients()
      ]
    });
    service = TestBed.inject(MockAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('keeps the access token in memory only on login and loads the user from /auth/me', () => {
    let response: AuthResponse | undefined;
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe((r) => (response = r));

    const login = http.expectOne(`${AUTH_API_BASE_URL}/auth/login`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    expect(login.request.withCredentials).toBe(true);
    login.flush(TOKENS);

    const me = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    expect(me.request.headers.get('Authorization')).toBe(`Bearer ${CUSTOMER_TOKEN}`);
    me.flush({ id: 'user-1', username: 'Gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const user = { id: 'user-1', username: 'Gaurang123', accountId: 6, roles: ['CUSTOMER'] };
    expect(response?.user).toEqual(user);
    expect(service.getCurrentUser()).toEqual(user);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getToken()).toBe(CUSTOMER_TOKEN);
    // The refresh token is the HttpOnly cookie: only a non-secret marker is visible.
    expect(service.getRefreshToken()).toBeTruthy();
    expect(service.getRefreshToken()).not.toBe('refresh-1');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(CUSTOMER_TOKEN);
  });

  it('rethrows a refused login as { errorCode, message, status } and stores nothing', () => {
    let error: AuthError | undefined;
    service.login({ username: 'gaurang123', password: 'wrong' }).subscribe({ error: (e) => (error = e) });

    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(UNAUTHORISED, { status: 401, statusText: 'Unauthorized' });

    expect(error).toEqual({ ...UNAUTHORISED, status: 401 });
    expect(service.isAuthenticated()).toBe(false);
    expect(service.getRefreshToken()).toBeNull();
  });

  it('clears the whole session on logout', () => {
    service.login({ username: 'gaurang123', password: 'pw' }).subscribe();
    http.expectOne(`${AUTH_API_BASE_URL}/auth/login`).flush(TOKENS);
    http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush({ id: 'user-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    service.logout();
    const logout = http.expectOne(`${AUTH_API_BASE_URL}/auth/logout`);
    expect(logout.request.body).toEqual({});
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });

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
      expect(refresh.request.body).toEqual({});
      expect(refresh.request.withCredentials).toBe(true);
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      refresh.flush({ ...TOKENS, accessToken: 'new-access', refreshToken: 'refresh-2' });

      const balance = http.expectOne(balanceUrl);
      const positions = http.expectOne(positionsUrl);
      expect(balance.request.headers.get('Authorization')).toBe('Bearer new-access');
      expect(positions.request.headers.get('Authorization')).toBe('Bearer new-access');
      balance.flush({ cash: 100 });
      positions.flush([]);

      expect(results).toEqual([{ cash: 100 }, []]);
      expect(service.getToken()).toBe('new-access');
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});

describe('MockAuthService session restore (in-memory access token)', () => {
  const USER = { id: 'user-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] };

  function create(): { service: MockAuthService; http: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        // Configure the generated clients exactly as app.config.ts does.
        ...provideApiClients()
      ]
    });
    return { service: TestBed.inject(MockAuthService), http: TestBed.inject(HttpTestingController) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('re-populates the access token from the refresh cookie for a returning user', () => {
    localStorage.setItem('current_user', JSON.stringify(USER));
    const { service, http } = create();
    let done = false;

    service.restoreSession().subscribe(() => (done = true));

    const refresh = http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.body).toEqual({});
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ ...TOKENS, accessToken: 'restored-access' });

    // Bootstrap re-reads the identity from GET /auth/me (verified token
    // server-side), so a hand-edited `current_user` entry cannot survive
    // a reload as spoofed ADMIN.
    const me = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    me.flush(USER);

    expect(done).toBe(true);
    expect(service.getToken()).toBe('restored-access');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.getCurrentUser()).toEqual(USER);
    http.verify();
  });

  it('overwrites a spoofed localStorage ADMIN with the token identity on restore', () => {
    const spoofed = { ...USER, roles: ['ADMIN'] };
    localStorage.setItem('current_user', JSON.stringify(spoofed));
    const { service, http } = create();

    service.restoreSession().subscribe();

    http.expectOne(`${AUTH_API_BASE_URL}/auth/refresh`).flush({ ...TOKENS, accessToken: CUSTOMER_TOKEN });
    // Server truth is CUSTOMER, so the spoofed ADMIN cache is healed.
    http.expectOne(`${AUTH_API_BASE_URL}/auth/me`).flush(USER);

    expect(service.getCurrentUser()).toEqual(USER);
    expect(service.isAdmin()).toBe(false);
    expect(service.getRolesFromToken()).toEqual(['CUSTOMER']);
    http.verify();
  });
});
