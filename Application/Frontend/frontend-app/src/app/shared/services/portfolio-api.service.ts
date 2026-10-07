import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PLService, PortfolioService } from '../../../generated/portfolio-client';
import { Pnl, PnlFilter, PortfolioSummary, PricedPosition } from '../models/portfolio.models';
import { TradeApiError } from '../models/order.models';

/**
 * Thin wrapper over the clients generated from portfolio-api.yaml. Errors are
 * rethrown as TradeApiError, like TradeApiService, so screens read
 * `err.errorCode` (MKT-503 when no holding could be priced).
 * The Authorization header is added by authTokenInterceptor.
 */
@Injectable({
  providedIn: 'root'
})
export class PortfolioApiService {
  private readonly portfolio = inject(PortfolioService);
  private readonly pnl = inject(PLService);

  // GET /api/v1/portfolio/{accountId}
  getSummary(accountId: number): Observable<PortfolioSummary> {
    return this.portfolio
      .getPortfolioSummary(accountId)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/portfolio/{accountId}/positions
  getPositions(accountId: number, symbol?: string): Observable<PricedPosition[]> {
    return this.portfolio
      .getPricedPositions(accountId, symbol || undefined)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

  // GET /api/v1/portfolio/{accountId}/pnl?from=&to=&bySymbol=
  getPnl(accountId: number, filter: PnlFilter = {}, bySymbol = true): Observable<Pnl> {
    return this.pnl
      .getPnl(accountId, filter.from || undefined, filter.to || undefined, bySymbol)
      .pipe(catchError((err) => this.rethrowServerError(err)));
  }

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
