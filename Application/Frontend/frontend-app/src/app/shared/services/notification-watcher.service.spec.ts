import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import {
  NOTIFICATION_FAST_POLL_MS,
  NOTIFICATION_FAST_WINDOW_MS,
  NOTIFICATION_POLL_MS,
  NotificationWatcherService
} from './notification-watcher.service';
import { TradeApiService } from './trade-api.service';
import { Notification } from '../models/order.models';

describe('NotificationWatcherService', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let watcher: NotificationWatcherService;

  const notification = (id: number): Notification => ({
    notificationId: id, eventId: `evt-${id}`, accountId: 6, type: 'ORDER_FILLED',
    title: `n${id}`, message: 'm', channel: 'PUSH', status: 'SENT', createdOn: '2026-10-07T09:00:00Z'
  });

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getNotifications']);
    TestBed.configureTestingModule({ providers: [{ provide: TradeApiService, useValue: tradeApi }] });
    watcher = TestBed.inject(NotificationWatcherService);
  });

  it('does not replay what was already in the inbox, then emits only what arrives later, oldest first', fakeAsync(() => {
    const seen: number[][] = [];
    tradeApi.getNotifications.and.returnValue(of([notification(2), notification(1)]));
    const sub = watcher.watch().subscribe((fresh) => seen.push(fresh.map((n) => n.notificationId)));

    tick(0);
    expect(seen).toEqual([]);

    tradeApi.getNotifications.and.returnValue(of([notification(4), notification(3), notification(2), notification(1)]));
    tick(NOTIFICATION_POLL_MS);
    expect(seen).toEqual([[3, 4]]);

    tick(NOTIFICATION_POLL_MS);
    expect(seen).toEqual([[3, 4]]);

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('treats an empty inbox at sign-in as nothing seen, so the first notification still shows', fakeAsync(() => {
    const seen: number[][] = [];
    tradeApi.getNotifications.and.returnValue(of([]));
    const sub = watcher.watch().subscribe((fresh) => seen.push(fresh.map((n) => n.notificationId)));
    tick(0);

    tradeApi.getNotifications.and.returnValue(of([notification(1)]));
    tick(NOTIFICATION_POLL_MS);
    expect(seen).toEqual([[1]]);

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('checks every few seconds for a minute after an order changed, then goes back to the normal pace', fakeAsync(() => {
    tradeApi.getNotifications.and.returnValue(of([]));
    const sub = watcher.watch().subscribe();
    tick(0);
    expect(tradeApi.getNotifications).toHaveBeenCalledTimes(1);

    watcher.expectSoon();
    tick(NOTIFICATION_FAST_POLL_MS);
    expect(tradeApi.getNotifications).toHaveBeenCalledTimes(2);
    tick(NOTIFICATION_FAST_POLL_MS);
    expect(tradeApi.getNotifications).toHaveBeenCalledTimes(3);

    tradeApi.getNotifications.calls.reset();
    tick(NOTIFICATION_FAST_WINDOW_MS);
    const duringRestOfWindow = tradeApi.getNotifications.calls.count();
    tradeApi.getNotifications.calls.reset();
    tick(NOTIFICATION_POLL_MS * 3);

    expect(duringRestOfWindow).toBeGreaterThan(20);
    expect(tradeApi.getNotifications.calls.count()).toBe(3);

    sub.unsubscribe();
    discardPeriodicTasks();
  }));

  it('skips a failed check and keeps watching', fakeAsync(() => {
    const seen: number[][] = [];
    tradeApi.getNotifications.and.returnValue(of([notification(1)]));
    const sub = watcher.watch().subscribe((fresh) => seen.push(fresh.map((n) => n.notificationId)));
    tick(0);

    tradeApi.getNotifications.and.returnValue(throwError(() => ({ status: 503 })));
    tick(NOTIFICATION_POLL_MS);

    tradeApi.getNotifications.and.returnValue(of([notification(2), notification(1)]));
    tick(NOTIFICATION_POLL_MS);
    expect(seen).toEqual([[2]]);

    sub.unsubscribe();
    discardPeriodicTasks();
  }));
});
