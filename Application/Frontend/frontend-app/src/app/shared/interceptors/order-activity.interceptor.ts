import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { TRADE_API_BASE_URL } from '../api/api-clients';
import { NotificationWatcherService } from '../services/notification-watcher.service';

const ORDERS_PATH = /^\/api\/v1\/orders(\/[^/?]+)?(\?|$)/;
const CHANGES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * When an order is placed, changed or cancelled successfully, an outcome
 * notification is likely within seconds, so the notification watcher checks
 * more often for a while. Watching the request here keeps the order screens
 * themselves unaware of notifications.
 */
export const orderActivityInterceptor: HttpInterceptorFn = (req, next) => {
  const isOrderChange =
    CHANGES.has(req.method) &&
    req.url.startsWith(`${TRADE_API_BASE_URL}/`) &&
    ORDERS_PATH.test(req.url.slice(TRADE_API_BASE_URL.length));
  if (!isOrderChange) {
    return next(req);
  }

  const watcher = inject(NotificationWatcherService);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.ok) {
        watcher.expectSoon();
      }
    })
  );
};
