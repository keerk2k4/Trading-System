import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { OrdersService } from '../../../generated/trade-client';
import {
  Account,
  Balance,
  BalanceUpdateRequest,
  Order,
  OrderHistoryFilter,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Position,
  TradeApiError
} from '../models/order.models';
import { TRADE_API_BASE_URL } from '../api/api-clients';

// Kept as a re-export so existing imports keep working; defined in api-clients.ts.
export { TRADE_API_BASE_URL };

/**
 * Thin wrapper over the clients generated from contracts/trade-api.yaml.
 * Request/response shapes come from the generated models, so a contract
 * change that breaks a caller fails the build instead of failing at runtime.
 * The Authorization header is added by authTokenInterceptor.
 */
@Injectable({
  providedIn: 'root'
})
export class TradeApiService {
  private http = inject(HttpClient);
  private orders = inject(OrdersService);

  // GET /api/v1/accounts/me
  getAccount(): Observable<Account> {
    return this.http
      .get<Account>(`${TRADE_API_BASE_URL}/api/v1/accounts/me`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/balance
  getBalance(): Observable<Balance> {
    return this.http
      .get<Balance>(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/positions
  getPositions(): Observable<Position[]> {
    return this.http
      .get<Position[]>(`${TRADE_API_BASE_URL}/api/v1/accounts/me/positions`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/me/orders, optionally narrowed by status
  // and/or an ISO date-time range.
  getOrders(filter: OrderHistoryFilter = {}): Observable<Order[]> {
    const params: Record<string, string> = {};
    if (filter.status) {
      params['status'] = filter.status;
    }
    if (filter.from) {
      params['from'] = new Date(filter.from).toISOString();
    }
    if (filter.to) {
      params['to'] = new Date(filter.to).toISOString();
    }

    return this.http
      .get<Order[]>(`${TRADE_API_BASE_URL}/api/v1/accounts/me/orders`, {
        params,
      })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // PATCH /api/v1/accounts/me/balance
  updateBalance(request: BalanceUpdateRequest): Observable<Balance> {
    return this.http
      .patch<Balance>(`${TRADE_API_BASE_URL}/api/v1/accounts/me/balance`, request)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // POST /api/v1/orders
  placeOrder(order: PlaceOrderRequest): Observable<PlaceOrderResponse> {
    return this.orders
      .placeOrder(order)
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
