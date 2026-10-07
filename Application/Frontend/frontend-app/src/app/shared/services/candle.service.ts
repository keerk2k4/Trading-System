import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay, throwError } from 'rxjs';
import { Candle, CandlesResponse } from '../models/candle.models';

/**
 * Instruments with a saved candles response under public/candles/. These are
 * captured responses of the market-data candles API, served as static files
 * so development does not spend the API quota.
 */
export const CANDLE_SYMBOLS: readonly string[] = ['AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NFLX', 'NVDA', 'TSLA'];

/** Raised for a symbol that has no saved candles. */
export class UnknownInstrumentError extends Error {
  constructor(readonly symbol: string) {
    super(`No such instrument: ${symbol}`);
    this.name = 'UnknownInstrumentError';
  }
}

@Injectable({ providedIn: 'root' })
export class CandleService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Observable<Candle[]>>();

  hasCandles(symbol: string): boolean {
    return CANDLE_SYMBOLS.includes(symbol.trim().toUpperCase());
  }

  /** Daily candles, oldest first. Errors with UnknownInstrumentError for other symbols. */
  getCandles(symbol: string): Observable<Candle[]> {
    const key = symbol.trim().toUpperCase();
    if (!this.hasCandles(key)) {
      return throwError(() => new UnknownInstrumentError(key));
    }
    let candles$ = this.cache.get(key);
    if (!candles$) {
      candles$ = this.http.get<CandlesResponse>(`candles/${key}.json`).pipe(
        map((response) => response.data.candles),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.cache.set(key, candles$);
    }
    return candles$;
  }
}
