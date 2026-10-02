// Watchlist models.
//
// Backend shapes mirror contracts/trade-api.yaml (WatchlistResponse,
// WatchlistDetailResponse, WatchlistStockResponse). The UI keeps the same
// `Watchlist` / `WatchlistStock` names so components are unchanged; the
// backend `id` is numeric while the legacy default used the string
// 'default', so `id` accepts both during migration.

/** A single tradable stock with the quote details shown in the UI. */
export interface WatchlistStock {
  /** Instrument symbol, e.g. `AAPL`. Always stored uppercase. */
  symbol: string;
  /** Company/display name, e.g. `Apple Inc.`. Backend sends `name`. */
  companyName: string;
  /** Current live price per unit (market-data cache or reference price). */
  price: number;
  /** Absolute price change vs. the previous close. */
  change: number;
  /** Percentage price change vs. the previous close. */
  changePercent: number;
}

/** One named collection of stock symbols owned by a user. */
export interface Watchlist {
  /** Stable identifier (numeric backend id; legacy 'default' tolerated). */
  id: string | number;
  /** Display name chosen by the user, e.g. `Tech Stocks`. */
  name: string;
  /** True only for the non-deletable default list. */
  isDefault: boolean;
  /** Symbols in this list, uppercase and unique within the list. */
  symbols: string[];
}

/** Backend detail payload with live-priced stocks. */
export interface WatchlistDetail {
  id: number;
  name: string;
  isDefault: boolean;
  stocks: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }>;
}

/** Result of attempting to add a stock to the selected watchlist. */
export type AddStockResult = 'added' | 'already-in-watchlist';
