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

  afterEach(() => jasmine.clock().uninstall());

  it('lists notifications newest first and says in words how each was delivered', () => {
    create();

    const rows = page.querySelectorAll('[data-testid="notification-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Order rejected: INFY.NS');
    expect(rows[0].querySelector('[data-testid="notification-type"]')?.textContent).toContain('Order rejected');
    expect(rows[0].querySelector('[data-testid="notification-status"]')?.textContent?.trim()).toBe('Sent by email');
    expect(rows[1].textContent).toContain('Order filled: ACME');
  });

  it('groups notifications by day, labelling today and yesterday', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-07T12:00:00'));
    tradeApi.getNotifications.and.returnValue(
      of([
        { notificationId: 3, eventId: 'evt-3', accountId: 6, type: 'ORDER_FILLED', title: 'Today', message: 'm',
          channel: 'EMAIL', status: 'SENT', createdOn: new Date('2026-10-07T09:00:00').toISOString() },
        { notificationId: 2, eventId: 'evt-2', accountId: 6, type: 'ORDER_FILLED', title: 'Yesterday', message: 'm',
          channel: 'EMAIL', status: 'SENT', createdOn: new Date('2026-10-06T09:00:00').toISOString() },
        { notificationId: 1, eventId: 'evt-1', accountId: 6, type: 'ORDER_FILLED', title: 'Older', message: 'm',
          channel: 'EMAIL', status: 'SENT', createdOn: new Date('2026-10-02T09:00:00').toISOString() }
      ])
    );
    create();

    const days = Array.from(page.querySelectorAll('[data-testid="notifications-day"]')).map((d) => d.textContent?.trim());
    expect(days).toEqual(['Today', 'Yesterday', 'Fri 2 Oct 2026']);
  });

  it('makes a queued or failed delivery plain, naming the channel', () => {
    tradeApi.getNotifications.and.returnValue(
      of([
        { notificationId: 2, eventId: 'evt-2', accountId: 6, type: 'PRICE_ALERT', title: 'Price alert: NVDA', message: 'm',
          channel: 'SMS', status: 'QUEUED', createdOn: '2026-10-07T10:30:00Z' },
        { notificationId: 1, eventId: 'evt-1', accountId: 6, type: 'ORDER_FILLED', title: 'Order filled: ACME', message: 'm',
          channel: 'PUSH', status: 'FAILED', createdOn: '2026-10-07T09:00:00Z' }
      ])
    );
    create();

    const status = Array.from(page.querySelectorAll('[data-testid="notification-status"]'));
    expect(status[0].textContent?.trim()).toBe('Waiting to send by SMS');
    expect(status[1].textContent).toContain("Couldn't send by push notification");
    expect(status[1].classList).toContain('is-failed');
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
