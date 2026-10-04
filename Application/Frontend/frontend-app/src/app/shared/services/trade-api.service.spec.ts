import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TradeApiService, TRADE_API_BASE_URL } from './trade-api.service';
import { MockAuthService } from './mock-auth.service';
import { accessTokenStore } from './access-token.store';
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
        // Configure the generated clients exactly as app.config.ts does.
        ...provideApiClients(),
        { provide: MockAuthService, useValue: { getToken: () => token } }
      ]
    });
    service = TestBed.inject(TradeApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('fetches the account, balance and positions for an account', () => {
    service.getAccount().subscribe();
    service.getBalance().subscribe();
    service.getPositions().subscribe();

    const account = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me`);
    const balance = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`);
    const positions = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/positions`);
    for (const req of [account, balance, positions]) {
      expect(req.request.method).toBe('GET');
    }
    account.flush({});
    balance.flush({});
    positions.flush([]);
  });

  it('sends the bearer token on trade API requests', () => {
    service.getBalance().subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test.jwt.token');
    req.flush({});
  });

  it('sends no Authorization header when there is no token', () => {
    token = null;
    service.getBalance().subscribe({ error: () => {} });

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('patches the account balance through the JWT-scoped endpoint', () => {
    service.updateBalance({ cashBalance: 2500.25 }).subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ cashBalance: 2500.25 });
    req.flush({ accountId: 17, cashBalance: 2500.25, currency: 'USD', asOf: '2026-10-01T00:00:00Z' });
  });

  it('requests order history with no query params by default', () => {
    service.getOrders().subscribe();

    const req = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me/orders`);
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('passes status, from and to as query params', () => {
    service
      .getOrders({
        status: 'FILLED',
        from: '2026-01-01T00:00:00Z',
        to: new Date('2026-02-01T00:00:00Z')
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === `${TRADE_API_BASE_URL}/api/v1/accounts/me/orders`);
    // The generated client percent-encodes each value exactly once before
    // handing it to HttpParams, so decode before comparing.
    const param = (name: string) => decodeURIComponent(req.request.params.get(name) ?? '');
    expect(param('status')).toBe('FILLED');
    expect(param('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(param('to')).toBe('2026-02-01T00:00:00.000Z');
    // Encoded exactly once (":" -> "%3A", never "%253A"); the Trade API
    // decodes it back to the same instant.
    expect(req.request.urlWithParams).toBe(
      `${TRADE_API_BASE_URL}/api/v1/accounts/me/orders` +
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

  it('fetches watchlists and live-priced detail from the backend', () => {
    service.getWatchlists().subscribe();
    service.getWatchlistDetail(1).subscribe();

    const lists = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists`);
    const detail = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists/1`);
    expect(lists.request.method).toBe('GET');
    expect(detail.request.method).toBe('GET');
    expect(lists.request.headers.get('Authorization')).toBe('Bearer test.jwt.token');
    lists.flush([]);
    detail.flush({ id: 1, name: 'Default', isDefault: true, stocks: [] });
  });

  it('creates, adds to and removes from watchlists through the backend', () => {
    service.createWatchlist('Tech').subscribe();
    const created = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists`);
    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({ name: 'Tech' });
    created.flush({ id: 2, name: 'Tech', isDefault: false, symbols: [] });

    service.addWatchlistInstrument(2, 'AAPL').subscribe();
    const added = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists/2/instruments`);
    expect(added.request.method).toBe('POST');
    expect(added.request.body).toEqual({ symbol: 'AAPL' });
    added.flush({ symbol: 'AAPL', name: 'Apple Inc.', price: 1, change: 0, changePercent: 0 });

    service.removeWatchlistInstrument(2, 'AAPL').subscribe();
    const removed = http.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists/2/instruments/AAPL`);
    expect(removed.request.method).toBe('DELETE');
    removed.flush(null);
  });

  it('rethrows the server errorCode and message with the HTTP status', () => {
    let error: TradeApiError | undefined;
    service.getAccount().subscribe({ error: (e) => (error = e) });

    http
      .expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me`)
      .flush({ errorCode: 'ACC-403', message: 'Account not active' }, { status: 403, statusText: 'Forbidden' });

    expect(error).toEqual({ errorCode: 'ACC-403', message: 'Account not active', status: 403 });
  });

  it('reports status 0 with no errorCode when the backend is unreachable', () => {
    let error: TradeApiError | undefined;
    service.getAccount().subscribe({ error: (e) => (error = e) });

    http.expectOne(`${TRADE_API_BASE_URL}/api/v1/accounts/me`).error(new ProgressEvent('error'));

    expect(error?.status).toBe(0);
    expect(error?.errorCode).toBe('');
  });
});

describe('authTokenInterceptor', () => {
  it('leaves the public auth-service endpoints untouched', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting()
      ]
    });
    const auth = TestBed.inject(MockAuthService);
    accessTokenStore.set('test.jwt.token');
    const http = TestBed.inject(HttpTestingController);

    auth
      .register({
        username: 'new.user',
        email: 'new.user@example.com',
        firstName: 'New',
        lastName: 'User',
        phone: '+919900000001',
        password: 'secret'
      })
      .subscribe();

    const req = http.expectOne('http://localhost:3000/auth/register');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.body).toEqual({
      username: 'new.user',
      email: 'new.user@example.com',
      firstName: 'New',
      lastName: 'User',
      phone: '+919900000001',
      password: 'secret'
    });
    req.flush({});
    http.verify();
    accessTokenStore.set(null);
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
    // Construct the auth service first: it resets the in-memory token on creation.
    TestBed.inject(MockAuthService);
    accessTokenStore.set('user.jwt.token');
  });

  afterEach(() => accessTokenStore.set(null));

  it('sends the bearer token on GET+PUT /kyc and maps the contract response', () => {
    const kyc = TestBed.inject(MockKycService);
    const http = TestBed.inject(HttpTestingController);
    let submission: KycSubmission | undefined;

    kyc
      .submitKyc('user-1', { dateOfBirth: '1995-04-12', documentType: 'PASSPORT', documentNumber: 'N1234567' })
      .subscribe((s) => (submission = s));

    const current = http.expectOne(`${AUTH_API_BASE_URL}/kyc`);
    expect(current.request.method).toBe('GET');
    expect(current.request.headers.get('Authorization')).toBe('Bearer user.jwt.token');
    current.flush({
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

    const req = http.expectOne(`${AUTH_API_BASE_URL}/kyc`);
    expect(req.request.method).toBe('PUT');
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

    const me = http.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    me.flush({ id: 'u-1', username: 'priya.menon', accountId: 6, roles: ['CUSTOMER'] });
    http.verify();
  });
});
