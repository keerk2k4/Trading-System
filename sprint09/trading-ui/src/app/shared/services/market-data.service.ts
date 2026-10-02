import { Injectable } from '@angular/core';
import { WatchlistStock } from '../models/watchlist.models';

/**
 * Available stock/market-data source for the Watchlist feature.
 *
 * The trade REST API (contracts/trade-api.yaml) currently exposes no
 * instrument listing and no quotes endpoint: it only validates order symbols
 * against `INSTRUMENTS.symbol` server-side. The live Fauxnance feed used by
 * the Trade Executor must stay backend-side (its API key must never ship to
 * the browser), so until the backend publishes a quotes endpoint this service
 * serves a reference catalog compiled from the seeded `trading.instruments`
 * rows (see seed/002_initial_trading_data.sql: AAPL, MSFT, GOOGL, AMZN, TSLA,
 * NVDA, META, NFLX with their seed prices) plus liquid banking names that the
 * seed does not cover yet.
 *
 * Price/change figures are a static reference snapshot for display, not live
 * market data. When the backend adds e.g. `GET /api/v1/instruments` and
 * `GET /api/v1/quotes?symbols=...`, replace the body of these methods with
 * HttpClient calls through TradeApiService (which already attaches the JWT
 * via authTokenInterceptor) and keep the method signatures.
 */
@Injectable({
  providedIn: 'root'
})
export class MarketDataService {
  /**
   * Reference catalog, ordered by sales rank. `topSellers()` returns a prefix
   * of this array, so the default watchlist is the top 10 selling stocks.
   */
  private readonly catalog: WatchlistStock[] = [
    { symbol: 'NFLX', companyName: 'Netflix Inc.', price: 1210.45, change: 18.62, changePercent: 1.56 },
    { symbol: 'META', companyName: 'Meta Platforms Inc.', price: 775.88, change: -6.34, changePercent: -0.81 },
    { symbol: 'MSFT', companyName: 'Microsoft Corporation', price: 509.77, change: 4.12, changePercent: 0.81 },
    { symbol: 'TSLA', companyName: 'Tesla Inc.', price: 331.12, change: -9.45, changePercent: -2.77 },
    { symbol: 'JPM', companyName: 'JPMorgan Chase & Co.', price: 264.1, change: 1.87, changePercent: 0.71 },
    { symbol: 'AMZN', companyName: 'Amazon.com Inc.', price: 233.88, change: 2.41, changePercent: 1.04 },
    { symbol: 'AAPL', companyName: 'Apple Inc.', price: 224.12, change: 2.14, changePercent: 0.96 },
    { symbol: 'GOOGL', companyName: 'Alphabet Inc.', price: 202.91, change: -1.08, changePercent: -0.53 },
    { symbol: 'NVDA', companyName: 'NVIDIA Corporation', price: 180.3, change: 3.66, changePercent: 2.07 },
    { symbol: 'AMD', companyName: 'Advanced Micro Devices Inc.', price: 122.45, change: -0.92, changePercent: -0.75 },
    { symbol: 'BAC', companyName: 'Bank of America Corporation', price: 44.85, change: 0.36, changePercent: 0.81 },
    { symbol: 'INTC', companyName: 'Intel Corporation', price: 21.3, change: -0.24, changePercent: -1.11 }
  ];

  /** Every known stock, in sales-rank order. Returns a copy. */
  listInstruments(): WatchlistStock[] {
    return [...this.catalog];
  }

  /** Top `limit` selling stocks (default 10) for the default watchlist. */
  topSellers(limit = 10): WatchlistStock[] {
    return this.catalog.slice(0, Math.max(0, limit));
  }

  /** Quote for one symbol (case-insensitive), or `undefined` when unknown. */
  quote(symbol: string): WatchlistStock | undefined {
    const key = symbol.trim().toUpperCase();
    return this.catalog.find((stock) => stock.symbol === key);
  }

  /**
   * Stocks whose company name or symbol contains the query
   * (case-insensitive). A blank query matches nothing.
   */
  search(query: string): WatchlistStock[] {
    const key = query.trim().toLowerCase();
    if (!key) {
      return [];
    }
    return this.catalog.filter(
      (stock) => stock.symbol.toLowerCase().includes(key) || stock.companyName.toLowerCase().includes(key)
    );
  }
}
