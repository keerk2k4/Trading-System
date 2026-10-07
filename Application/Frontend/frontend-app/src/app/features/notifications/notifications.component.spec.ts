import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NotificationsComponent } from './notifications.component';
import { TradeApiService } from '../../shared/services/trade-api.service';

describe('NotificationsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<NotificationsComponent>;
  let page: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TradeApiService, useValue: tradeApi }]
    });
    fixture = TestBed.createComponent(NotificationsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getNotifications']);
    tradeApi.getNotifications.and.returnValue(
      of([
        {
          notificationId: 2, eventId: 'evt-2', accountId: 6, type: 'ORDER_REJECTED',
          title: 'Order rejected: INFY.NS', message: 'Your order for 5 INFY.NS (BUY) was rejected.',
          channel: 'EMAIL', status: 'SENT', createdOn: '2026-10-07T10:30:00Z', sentOn: '2026-10-07T10:30:01Z'
        },
        {
          notificationId: 1, eventId: 'evt-1', accountId: 6, type: 'ORDER_FILLED',
          title: 'Order filled: ACME', message: 'Your order for 10 ACME (BUY) has been filled.',
          channel: 'EMAIL', status: 'SENT', createdOn: '2026-10-07T09:00:00Z', sentOn: '2026-10-07T09:00:01Z'
        }
      ])
    );
  });

  it('lists notifications newest first with channel and status', () => {
    create();

    const rows = page.querySelectorAll('[data-testid="notification-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Order rejected: INFY.NS');
    expect(rows[0].textContent).toContain('Channel: EMAIL');
    expect(rows[1].textContent).toContain('Order filled: ACME');
  });

  it('explains the empty state', () => {
    tradeApi.getNotifications.and.returnValue(of([]));
    create();

    expect(page.querySelector('[data-testid="notifications-empty"]')?.textContent).toContain('No notifications yet');
  });

  it('shows a mapped error when the API fails', () => {
    tradeApi.getNotifications.and.returnValue(throwError(() => ({ errorCode: 'ACC-403', message: '', status: 403 })));
    create();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not active');
  });
});
