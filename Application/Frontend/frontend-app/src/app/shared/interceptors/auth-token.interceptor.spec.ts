import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { authTokenInterceptor } from './auth-token.interceptor';
import { MockAuthService } from '../services/auth.service';
import { AUTH_API_BASE_URL, TRADE_API_BASE_URL } from '../api/api-clients';

describe('authTokenInterceptor', () => {
  const TOKEN = 'header.payload.signature';
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        {
          provide: MockAuthService,
          useValue: { getToken: () => TOKEN, getRefreshToken: () => null, isAuthenticated: () => true }
        }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to trade API requests', () => {
    const url = `${TRADE_API_BASE_URL}/api/v1/accounts/6/orders`;
    http.get(url).subscribe();

    const req = backend.expectOne(url);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush([]);
  });

  it('sends the public login request without a bearer token', () => {
    const url = `${AUTH_API_BASE_URL}/auth/login`;
    http.post(url, { username: 'trader', password: 'secret' }).subscribe();

    const req = backend.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('sends the public auth health check without a bearer token', () => {
    const url = `${AUTH_API_BASE_URL}/health`;
    http.get(url).subscribe();

    const req = backend.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ status: 'UP' });
  });

  it('adds the bearer token to the admin-only auth health details', () => {
    const url = `${AUTH_API_BASE_URL}/health/details`;
    http.get(url).subscribe();

    const req = backend.expectOne(url);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    req.flush({});
  });

  it('never sends the bearer token to a third-party origin', () => {
    const url = 'https://market-data.example.com/v1/quotes?symbol=AAPL';
    http.get(url).subscribe();

    const req = backend.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
