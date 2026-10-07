import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  exhaustMap,
  filter,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
  takeUntil,
  timer
} from 'rxjs';
import { Notification } from '../models/order.models';
import { TradeApiService } from './trade-api.service';

/** How often the inbox is checked while the tab is visible. */
export const NOTIFICATION_POLL_MS = 10_000;
/** How often it is checked right after an order changed, when an outcome is likely. */
export const NOTIFICATION_FAST_POLL_MS = 2_000;
/** How long the fast checks last: covers the executor's 15 s limit-order delay and a quote or two. */
export const NOTIFICATION_FAST_WINDOW_MS = 60_000;

/**
 * Watches the signed-in customer's inbox and emits the notifications that
 * arrived since the last look, oldest first. The first successful check only
 * records what is already there, so signing in does not replay the history.
 *
 * Checks run while the tab is visible: at once when it becomes visible, then
 * every NOTIFICATION_POLL_MS. After expectSoon() (an order was placed,
 * changed or cancelled) they run every NOTIFICATION_FAST_POLL_MS for
 * NOTIFICATION_FAST_WINDOW_MS, so the outcome shows within seconds. A failed
 * check is skipped, not retried early.
 */
@Injectable({ providedIn: 'root' })
export class NotificationWatcherService {
  private readonly tradeApi = inject(TradeApiService);
  private readonly document = inject(DOCUMENT);
  private readonly expect$ = new Subject<void>();

  /** An outcome is likely soon: check every few seconds for a while. */
  expectSoon(): void {
    this.expect$.next();
  }

  watch(): Observable<Notification[]> {
    let newestSeen: number | null = null;

    const visible$ = fromEvent(this.document, 'visibilitychange').pipe(
      startWith(null),
      map(() => this.document.visibilityState !== 'hidden'),
      distinctUntilChanged()
    );
    const regular$ = visible$.pipe(switchMap((visible) => (visible ? timer(0, NOTIFICATION_POLL_MS) : EMPTY)));
    // Each expectSoon() restarts the window.
    const fast$ = this.expect$.pipe(
      switchMap(() =>
        timer(NOTIFICATION_FAST_POLL_MS, NOTIFICATION_FAST_POLL_MS).pipe(takeUntil(timer(NOTIFICATION_FAST_WINDOW_MS)))
      ),
      filter(() => this.document.visibilityState !== 'hidden')
    );

    return merge(regular$, fast$).pipe(
      // A check still running absorbs further ticks.
      exhaustMap(() => this.tradeApi.getNotifications().pipe(catchError(() => EMPTY))),
      map((notifications) => {
        const newest = Math.max(0, ...notifications.map((n) => n.notificationId));
        if (newestSeen === null) {
          newestSeen = newest;
          return [];
        }
        const since = newestSeen;
        newestSeen = Math.max(since, newest);
        return notifications
          .filter((n) => n.notificationId > since)
          .sort((a, b) => a.notificationId - b.notificationId);
      }),
      filter((fresh) => fresh.length > 0)
    );
  }
}
