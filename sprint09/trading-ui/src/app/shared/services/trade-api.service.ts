import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
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

// Base URL of the Spring Boot trade API. The Authorization header is not
// set here - authTokenInterceptor adds it to every request under this URL.
export const TRADE_API_BASE_URL = 'http://localhost:8080';

@Injectable({
  providedIn: 'root'
})
export class TradeApiService {
  constructor(private http: HttpClient) {}

  // GET /api/v1/accounts/{accountId}
  getAccount(accountId: number): Observable<Account> {
    return this.http
      .get<Account>(`${TRADE_API_BASE_URL}/api/v1/accounts/${accountId}`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{accountId}/balance
  getBalance(accountId: number): Observable<Balance> {
    return this.http
      .get<Balance>(`${TRADE_API_BASE_URL}/api/v1/accounts/${accountId}/balance`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{accountId}/positions
  getPositions(accountId: number): Observable<Position[]> {
    return this.http
      .get<Position[]>(`${TRADE_API_BASE_URL}/api/v1/accounts/${accountId}/positions`)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/accounts/{accountId}/orders, optionally narrowed by status
  // and/or an ISO date-time range.
  getOrders(accountId: number, filter: OrderHistoryFilter = {}): Observable<Order[]> {
    let params = new HttpParams();
    if (filter.status) {
      params = params.set('status', filter.status);
    }
    if (filter.from) {
      params = params.set('from', new Date(filter.from).toISOString());
    }
    if (filter.to) {
      params = params.set('to', new Date(filter.to).toISOString());
    }

    return this.http
      .get<Order[]>(`${TRADE_API_BASE_URL}/api/v1/accounts/${accountId}/orders`, { params })
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // POST /api/v1/orders
  placeOrder(order: PlaceOrderRequest): Observable<PlaceOrderResponse> {
    return this.http
      .post<PlaceOrderResponse>(`${TRADE_API_BASE_URL}/api/v1/orders`, order)
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
