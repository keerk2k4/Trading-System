// Portfolio and P&L models.
//
// Wire types are aliases of the models generated from
// Contracts/API-Schemas/portfolio-api.yaml (src/generated/portfolio-client),
// so a contract change that breaks a caller fails the build.
import type {
  PnlResponse,
  PortfolioSummary as ContractPortfolioSummary,
  PricedPosition as ContractPricedPosition,
  SymbolPnl as ContractSymbolPnl
} from '../../../generated/portfolio-client';

// GET /api/v1/portfolio/{accountId}
export type PortfolioSummary = ContractPortfolioSummary;
// GET /api/v1/portfolio/{accountId}/positions
export type PricedPosition = ContractPricedPosition;
// GET /api/v1/portfolio/{accountId}/pnl
export type Pnl = PnlResponse;
export type SymbolPnl = ContractSymbolPnl;

// UI-only: the realised P&L date range on the portfolio screen, as yyyy-MM-dd.
export interface PnlFilter {
  from?: string;
  to?: string;
}

// UI-only: one day of the value-over-time chart, rebuilt in the browser from
// the account's filled orders and the saved daily candles.
export interface PortfolioHistoryPoint {
  date: string;
  /** Holdings valued at that day's close. */
  marketValue: number;
  /** Holdings valued at their average cost on that day. */
  costBasis: number;
  /** Profit and loss booked by sales up to and including that day. */
  realisedPnl: number;
  /**
   * Unrealised plus realised to date: marketValue - costBasis + realisedPnl.
   * Unlike marketValue, a trade does not move it (a buy adds the same to value
   * and cost; a sale turns unrealised into realised), so it moves with prices only.
   */
  totalPnl: number;
  /** totalPnl split by instrument: each one's unrealised plus realised to date. */
  pnlBySymbol: Record<string, number>;
  /** Time-weighted return since the first trade, in per cent; trades and added cash do not move it. */
  returnPct: number;
  /** Equal-weight buy-and-hold of the comparison instruments over the same days, in per cent. */
  marketReturnPct: number | null;
  /** True when a price that day was filled in by the provider (holiday, today). */
  synthetic: boolean;
  /** Fills that happened on this date. */
  trades: PortfolioHistoryTrade[];
}

export interface PortfolioHistoryTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
}
