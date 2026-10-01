import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AccountsService, OrdersService } from '../../../generated/trade-client';
import {
  Account,
  Balance,
  Order,
  OrderHistoryFilter,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Position,
  TradeApiError
} from '../models/order.models';

// Kept as a re-export so existing imports keep working; defined in api-clients.ts.
export { TRADE_API_BASE_URL } from '../api/api-clients';

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
  private accounts = inject(AccountsService);
  private orders = inject(OrdersService);

  // GET /api/v1/accounts/{id}
  getAccount(accountId: number): Observable<Account> {
    return this.accounts
      .getAccount(accountId)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{id}/balance
  getBalance(accountId: number): Observable<Balance> {
    return this.accounts
      .getBalance(accountId)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{id}/positions
  getPositions(accountId: number): Observable<Position[]> {
    return this.accounts
      .getPositions(accountId)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{id}/orders, optionally narrowed by status
  // and/or an ISO date-time range.
  getOrders(accountId: number, filter: OrderHistoryFilter = {}): Observable<Order[]> {
    return this.accounts
      .getOrders(
        accountId,
        filter.status || undefined,
        filter.from ? new Date(filter.from).toISOString() : undefined,
        filter.to ? new Date(filter.to).toISOString() : undefined
      )
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
