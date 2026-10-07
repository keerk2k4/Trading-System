import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TradeApiService, TRADE_API_BASE_URL } from './trade-api.service';
import { MockAuthService } from './auth.service';
import { authTokenInterceptor } from '../interceptors/auth-token.interceptor';
import { PlaceOrderRequest, TradeApiError } from '../models/order.models';
import { provideApiClients } from '../api/api-clients';

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
      orderType: 'LIMIT',
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
