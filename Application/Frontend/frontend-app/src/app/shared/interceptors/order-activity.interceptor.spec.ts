import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { orderActivityInterceptor } from './order-activity.interceptor';
import { NotificationWatcherService } from '../services/notification-watcher.service';
import { TRADE_API_BASE_URL } from '../api/api-clients';

describe('orderActivityInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let watcher: jasmine.SpyObj<NotificationWatcherService>;

  beforeEach(() => {
    watcher = jasmine.createSpyObj<NotificationWatcherService>('NotificationWatcherService', ['expectSoon']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([orderActivityInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationWatcherService, useValue: watcher }
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('asks for quick checks after an order is placed, changed or cancelled', () => {
    http.post(`${TRADE_API_BASE_URL}/api/v1/orders`, {}).subscribe();
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders`).flush({}, { status: 201, statusText: 'Created' });
    http.patch(`${TRADE_API_BASE_URL}/api/v1/orders/abc`, {}).subscribe();
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders/abc`).flush({});
    http.delete(`${TRADE_API_BASE_URL}/api/v1/orders/abc`).subscribe();
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders/abc`).flush({});

    expect(watcher.expectSoon).toHaveBeenCalledTimes(3);
  });

  it('does nothing for a refused order, a read, or another route', () => {
    http.post(`${TRADE_API_BASE_URL}/api/v1/orders`, {}).subscribe({ error: () => undefined });
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders`).flush({}, { status: 422, statusText: 'Unprocessable' });
    http.get(`${TRADE_API_BASE_URL}/api/v1/orders/abc`).subscribe();
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/orders/abc`).flush({});
    http.post(`${TRADE_API_BASE_URL}/api/v1/watchlists`, {}).subscribe();
    backend.expectOne(`${TRADE_API_BASE_URL}/api/v1/watchlists`).flush({});

    expect(watcher.expectSoon).not.toHaveBeenCalled();
  });
});
