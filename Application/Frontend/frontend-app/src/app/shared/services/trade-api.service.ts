import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  AccountsService,
  InstrumentResponse,
  NotificationsService,
  OrdersService,
  PreferencesService,
  StrategiesService,
  WatchlistDetailResponse,
  WatchlistResponse,
  WatchlistStockResponse,
  WatchlistsService
} from '../../../generated/trade-client';
import {
  Account,
  Balance,
  BalanceUpdateRequest,
  CreateStrategyRequest,
  Holding,
  Notification,
  Order,
  OrderHistoryFilter,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Position,
  Preferences,
  Quote,
  StrategyPreference,
  TradeApiError,
  UpdateOrderRequest,
  UpdatePreferences
} from '../models/order.models';
import { TRADE_API_BASE_URL } from '../api/api-clients';

// Kept as a re-export so existing imports keep working; defined in api-clients.ts.
export { TRADE_API_BASE_URL };

/**
 * Thin wrapper over the clients generated from contracts/trade-api.yaml.
 * Every call goes through a generated service, and request/response shapes
 * come from the generated models, so a contract change that breaks a caller
 * fails the build instead of failing at runtime.
 * The Authorization header is added by authTokenInterceptor.
 */
@Injectable({
  providedIn: 'root'
})
export class TradeApiService {
  private orders = inject(OrdersService);
  private accounts = inject(AccountsService);
  private watchlists = inject(WatchlistsService);
  private preferences = inject(PreferencesService);
  private notifications = inject(NotificationsService);
  private strategies = inject(StrategiesService);

  // GET /api/v1/accounts/me
  getAccount(): Observable<Account> {
    return this.accounts
      .getMyAccount()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/balance
  getBalance(): Observable<Balance> {
    return this.accounts
      .getMyBalance()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/positions
  getPositions(): Observable<Position[]> {
    return this.accounts
      .getMyPositions()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/holdings — settled holdings only. A filled
  // DELIVERY buy shows in positions first and moves here after settlement.
  getHoldings(): Observable<Holding[]> {
    return this.accounts
      .getMyHoldings()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  private isApi404(err: HttpErrorResponse): boolean {
    const code = err.error?.errorCode;
    const message = String(err.error?.message ?? '').toLowerCase();
    return err.status === 404 && (code === 'API-404' || message === 'not found');
  }

  private defaultPreferences(): Preferences {
    return {
      accountId: 0,
      defaultAccountId: null,
      alertChannel: 'EMAIL'
    };
  }

  // GET /api/v1/preferences/me
  getPreferences(): Observable<Preferences> {
    return this.preferences
      .getMyPreferences()
      .pipe(catchError((err) => this.fallbackPreferences(err)))
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  private fallbackPreferences(err: HttpErrorResponse): Observable<Preferences> {
    // JWT-scoped customer APIs only. If this endpoint is missing in the
    // running backend, use safe UI defaults instead of calling account-id
    // routes that are not part of the customer contract.
    if (!this.isApi404(err)) {
      throw err;
    }
    return of(this.defaultPreferences());
  }

  // PUT /api/v1/preferences/me
  updatePreferences(update: UpdatePreferences): Observable<Preferences> {
    return this.preferences
      .updateMyPreferences(update)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/notifications/me — backend inbox, newest first.
  getNotifications(): Observable<Notification[]> {
    return this.notifications
      .getMyNotifications()
      .pipe(catchError((err) => this.fallbackNotifications(err)))
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  private fallbackNotifications(err: HttpErrorResponse): Observable<Notification[]> {
    // JWT-scoped customer APIs only. Missing notifications endpoint should not
    // trigger calls to non-contracted account-id routes from the UI.
    if (!this.isApi404(err)) {
      throw err;
    }
    return of([]);
  }

  // GET /api/v1/accounts/me/orders, optionally narrowed by status
  // and/or an ISO date-time range.
  // Unset filters stay undefined, which the generated client leaves out of
  // the query string.
  getOrders(filter: OrderHistoryFilter = {}): Observable<Order[]> {
    const status = filter.status || undefined;
    const from = filter.from ? new Date(filter.from).toISOString() : undefined;
    const to = filter.to ? new Date(filter.to).toISOString() : undefined;

    return this.accounts
      .getMyOrders(status, from, to)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/strategies
  getStrategies(): Observable<StrategyPreference[]> {
    return this.strategies
      .getMyStrategies()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // POST /api/v1/strategies
  createStrategy(request: CreateStrategyRequest): Observable<StrategyPreference> {
    return this.strategies
      .createStrategy(request)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // DELETE /api/v1/strategies/{strategyId}
  cancelStrategy(strategyId: number): Observable<void> {
    return this.strategies.cancelStrategy(strategyId).pipe(
      map(() => undefined),
      catchError((err) => this.rethrowServerError(err))
    );
  }

  // PATCH /api/v1/accounts/me/balance
  updateBalance(request: BalanceUpdateRequest): Observable<Balance> {
    return this.accounts
      .updateMyBalance(request)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // POST /api/v1/orders
  placeOrder(order: PlaceOrderRequest): Observable<PlaceOrderResponse> {
    return this.orders
      .placeOrder(order)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // DELETE /api/v1/orders/{id} — cancels a NEW order.
  cancelOrder(orderId: string): Observable<PlaceOrderResponse> {
    return this.orders
      .cancelOrder(orderId.replace(/^ORD-/i, ''))
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // PATCH /api/v1/orders/{id} — updates quantity and/or limit price of a NEW order.
  updateOrder(orderId: string, update: UpdateOrderRequest): Observable<PlaceOrderResponse> {
    return this.orders
      .updateOrder(orderId.replace(/^ORD-/i, ''), update)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/instruments/{symbol}/quote — latest cached quote for MARKET tickets.
  getQuote(symbol: string): Observable<Quote> {
    return this.watchlists
      .getQuote(symbol.trim().toUpperCase())
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/watchlists
  getWatchlists(): Observable<WatchlistResponse[]> {
    return this.watchlists
      .getWatchlists()
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // POST /api/v1/watchlists
  createWatchlist(name: string): Observable<WatchlistResponse> {
    return this.watchlists
      .createWatchlist({ name })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/watchlists/{id}
  getWatchlistDetail(id: number | string): Observable<WatchlistDetailResponse> {
    return this.watchlists
      .getWatchlist(Number(id))
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // DELETE /api/v1/watchlists/{id}
  deleteWatchlist(id: number | string): Observable<void> {
    return this.watchlists.deleteWatchlist(Number(id)).pipe(
      map(() => undefined),
      catchError((err) => this.rethrowServerError(err))
    );
  }

  // POST /api/v1/watchlists/{id}/instruments
  addWatchlistInstrument(id: number | string, symbol: string): Observable<WatchlistStockResponse> {
    return this.watchlists
      .addWatchlistInstrument(Number(id), { symbol })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // DELETE /api/v1/watchlists/{id}/instruments/{symbol}
  // The generated client encodes the symbol into the path itself.
  removeWatchlistInstrument(id: number | string, symbol: string): Observable<void> {
    return this.watchlists.removeWatchlistInstrument(Number(id), symbol).pipe(
      map(() => undefined),
      catchError((err) => this.rethrowServerError(err))
    );
  }

  // GET /api/v1/instruments?search=
  searchInstruments(query: string): Observable<InstrumentResponse[]> {
    return this.watchlists
      .searchInstruments(query)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // Same idea as MockAuthService.rethrowServerError: unwrap the server's
  // { errorCode, message } body so components keep reading `err.errorCode`.
  // The HTTP status is carried along too, because a request that never
  // reached the backend (status 0) has no such body to unwrap.
  private rethrowServerError(err: HttpErrorResponse): Observable<never> {
    const body = err.error;
    const error: TradeApiError = {
      errorCode: body?.errorCode ?? '',
      message: body?.message ?? 'Unexpected error',
      status: err.status
    };
    throw error;
  }
}
