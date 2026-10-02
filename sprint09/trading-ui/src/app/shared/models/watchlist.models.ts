// Watchlist models.
//
// UI-only shapes for the Watchlist feature. There is currently no watchlist
// section in contracts/trade-api.yaml, so these types are deliberately local
// (unlike order.models.ts, which aliases the generated client). When the
// backend exposes watchlist endpoints, matching schemas should be added to
// the contract and these aliases switched to the regenerated client.

/** A single tradable stock with the quote details shown in the UI. */
export interface WatchlistStock {
  /** Instrument symbol, e.g. `AAPL`. Always stored uppercase. */
  symbol: string;
  /** Company/display name, e.g. `Apple Inc.`. */
  companyName: string;
  /** Current (reference) price per unit. */
  price: number;
  /** Absolute price change vs. the previous close. */
  change: number;
  /** Percentage price change vs. the previous close. */
  changePercent: number;
}

/** One named collection of stock symbols owned by a user. */
export interface Watchlist {
  /** Stable identifier. The default list always uses `default`. */
  id: string;
  /** Display name chosen by the user, e.g. `Tech Stocks`. */
  name: string;
  /** True only for the seeded, non-deletable default list. */
  isDefault: boolean;
  /** Symbols in this list, uppercase and unique within the list. */
  symbols: string[];
}

/** Result of attempting to add a stock to the selected watchlist. */
export type AddStockResult = 'added' | 'already-in-watchlist';
