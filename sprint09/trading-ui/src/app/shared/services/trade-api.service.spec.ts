import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TradeApiService, TRADE_API_BASE_URL } from './trade-api.service';
import { MockAuthService } from './mock-auth.service';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { PlaceOrderRequest, TradeApiError } from '../models/order.models';

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
    expect(req.request.params.get('status')).toBe('FILLED');
    expect(req.request.params.get('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(req.request.params.get('to')).toBe('2026-02-01T00:00:00.000Z');
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

    auth.register({ username: 'new.user', password: 'secret', confirmPassword: 'secret' }).subscribe();

    const req = http.expectOne('http://localhost:3000/auth/register');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    http.verify();
    localStorage.removeItem('auth_token');
  });
});
