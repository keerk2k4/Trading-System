import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TradeApiService, TRADE_API_BASE_URL } from './trade-api.service';
import { MockAuthService } from './mock-auth.service';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { PlaceOrderRequest, TradeApiError } from '../models/order.models';
import { KycSubmission } from '../models/kyc.models';
import { MockKycService } from './mock-kyc.service';
import { AUTH_API_BASE_URL, provideApiClients } from '../api/api-clients';

describe('TradeApiService', () => {
  let service: TradeApiService;
  let http: HttpTestingController;
  let token: string | null;

  beforeEach(() => {
    token = 'test.jwt.token';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: MockAuthService, useValue: { getToken: () => token } }
      ]
    });
    service = TestBed.inject(TradeApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the account, balance and positions for an account', () => {
    service.getAccount(17).subscribe();
    service.getBalance(17).subscribe();
    service.getPositions(17).subscribe();

    const account = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17`);
    const balance = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17/balance`);
    const positions = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17/positions`);
    for (const req of [account, balance, positions]) {
      expect(req.request.method).toBe('GET');
    }
    account.flush({});
    balance.flush({});
    positions.flush([]);
  });

  it('sends the bearer token on trade API requests', () => {
    service.getBalance(17).subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17/balance`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test.jwt.token');
    req.flush({});
  });

  it('sends no Authorization header when there is no token', () => {
    token = null;
    service.getBalance(17).subscribe({ error: () => {} });

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17/balance`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('requests order history with no query params by default', () => {
    service.getOrders(17).subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17/orders`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('passes status, from and to as query params', () => {
    service
      .getOrders(17, {
        status: 'FILLED',
        from: '2026-01-01T00:00:00Z',
        to: new Date('2026-02-01T00:00:00Z')
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === `${TRADE_API_BASE_URL}/api/v1/accounts/17/orders`);
    // The generated client percent-encodes each value exactly once before
    // handing it to HttpParams, so decode before comparing.
    const param = (name: string) => decodeURIComponent(req.request.params.get(name) ?? '');
    expect(param('status')).toBe('FILLED');
    expect(param('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(param('to')).toBe('2026-02-01T00:00:00.000Z');
    expect(req.request.urlWithParams).toBe(
      `${TRADE_API_BASE_URL}/api/v1/accounts/17/orders` +
        '?status=FILLED&from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z'
    );
    req.flush([]);
  });

  it('posts the order body to /api/v1/orders', () => {
    const order: PlaceOrderRequest = {
      accountId: 17,
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 10,
      price: 150.25,
      idempotencyKey: '3f2b8c1e-0000-4000-8000-000000000000'
    };
    service.placeOrder(order).subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(order);
    req.flush({ orderId: 'ORD-1', status: 'NEW' });
  });

  it('rethrows the server errorCode and message with the HTTP status', () => {
    let error: TradeApiError | undefined;
    service.getAccount(17).subscribe({ error: (e) => (error = e) });

    http
      .expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17`)
      .flush({ errorCode: 'ACC-403', message: 'Account not active' }, { status: 403, statusText: 'Forbidden' });

    expect(error).toEqual({ errorCode: 'ACC-403', message: 'Account not active', status: 403 });
  });

  it('reports status 0 with no errorCode when the backend is unreachable', () => {
    let error: TradeApiError | undefined;
    service.getAccount(17).subscribe({ error: (e) => (error = e) });

    http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/17`).error(new ProgressEvent('error'));

    expect(error?.status).toBe(0);
    expect(error?.errorCode).toBe('');
  });
});

describe('authTokenInterceptor', () => {
  it('leaves requests to other origins (auth-service) untouched', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting()
      ]
    });
    localStorage.setItem('auth_token', 'test.jwt.token');
    const auth = TestBed.inject(MockAuthService);
    const http = TestBed.inject(HttpTestingController);

    auth.register({
      username: 'new.user',
      email: 'new.user@example.com',
      password: 'secret',
      confirmPassword: 'secret'
    }).subscribe();

    const req = http.expectOne('http://localhost:3000/auth/register');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.body).toEqual({
      username: 'new.user',
      password: 'secret',
      email: 'new.user@example.com'
    });
    req.flush({});
    http.verify();
    localStorage.removeItem('auth_token');
  });
});

describe('generated auth client wiring (provideApiClients)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        ...provideApiClients()
      ]
    });
    localStorage.setItem('auth_token', 'user.jwt.token');
  });

  afterEach(() => localStorage.removeItem('auth_token'));

  it('sends the bearer token on POST /kyc and maps the contract response', () => {
    const kyc = TestBed.inject(MockKycService);
    const http = TestBed.inject(HttpTestingController);
    let submission: KycSubmission | undefined;

    kyc
      .submitKyc('user-1', { dateOfBirth: '1995-04-12', documentType: 'PASSPORT', documentNumber: 'N1234567' })
      .subscribe((s) => (submission = s));

    const req = http.expectOne(`${AUTH_API_BASE_URL}/kyc`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer user.jwt.token');
    expect(req.request.body).toEqual({
      dateOfBirth: '1995-04-12',
      documentType: 'PASSPORT',
      documentNumber: 'N1234567'
    });
    req.flush({
      id: 42,
      userId: 'user-1',
      status: 'PENDING',
      dateOfBirth: '1995-04-12',
      documentType: 'PASSPORT',
      documentNumber: 'N1234567',
      submittedAt: '2026-09-30T08:00:00Z',
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null
    });

    expect(submission?.id).toBe('42');
    expect(submission?.status).toBe('PENDING');
    expect(submission?.submittedAt).toEqual(new Date('2026-09-30T08:00:00Z'));
    expect(submission?.reviewedAt).toBeUndefined();
    http.verify();
  });

  it('never sends a bearer token on login, which the contract marks as public', () => {
    const auth = TestBed.inject(MockAuthService);
    const http = TestBed.inject(HttpTestingController);

    auth.login({ username: 'priya.menon', password: 'correct horse battery staple' }).subscribe();

    const req = http.expectOne(`${AUTH_API_BASE_URL}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ accessToken: 'a.b.c', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 });
    http.verify();
  });
});
