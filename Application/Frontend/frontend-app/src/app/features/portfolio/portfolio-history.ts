import { Candle } from '../../shared/models/candle.models';
import { Order } from '../../shared/models/order.models';
import { PortfolioHistoryPoint, PortfolioHistoryTrade } from '../../shared/models/portfolio.models';

/**
 * The account's value over time, rebuilt in the browser.
 *
 * Not part of contracts/portfolio-api.yaml, which leaves price history out of
 * scope: this replays the account's FILLED orders (GET /accounts/me/orders)
 * against the saved daily candles (public/candles/*.json) with the same rules
 * as the executor's SettlementService. A BUY moves the weighted average cost,
 * rounded to cents; a SELL leaves it; selling the last share resets it.
 *
 * For each candle date from the first fill onwards:
 *   marketValue = sum of quantity held x that day's close
 *   costBasis   = sum of quantity held x average cost
 *   realisedPnl = sum over sales so far of (sale price - average cost) x quantity
 *   totalPnl    = marketValue - costBasis + realisedPnl
 * totalPnl is the performance line: trades do not move it, prices do.
 * pnlBySymbol splits it by instrument (that symbol's unrealised + realised).
 *
 * returnPct is the time-weighted return: each day's return is the change in
 * value net of that day's trades, over what was invested during the day,
 *   r = (value - previous value - bought + sold) / previous value
 * and the days are chained, (1 + r1)(1 + r2)... - 1. Fills happen at the
 * close, so money put in on a day was not invested during it and is not in
 * the denominator. (On the very first day, with nothing held before, the
 * purchase itself is the base, which captures any gap between fill and close.)
 * Adding money does not move it, so portfolios of any size compare, including
 * against the market.
 *
 * marketReturnPct is the comparison: an equal amount put into every
 * instrument with saved candles on the first day and held, i.e. the average
 * of each one's close / first close - 1.
 * A day with no candle for a held symbol (a holiday in one market) carries
 * the previous close forward and is marked synthetic, as is a bar the
 * provider filled in itself.
 */
export interface PortfolioHistory {
  points: PortfolioHistoryPoint[];
  /** Traded symbols with no saved candles, left out of both lines. */
  missingSymbols: string[];
  /** Traded symbols with candles: the keys of pnlBySymbol. */
  symbols: string[];
  /** Instruments in the market comparison. */
  benchmarkSymbols: string[];
}

interface Fill extends PortfolioHistoryTrade {
  date: string;
  at: number;
}

interface Holding {
  quantity: number;
  averageCost: number;
}

export function buildPortfolioHistory(orders: Order[], candlesBySymbol: Record<string, Candle[]>): PortfolioHistory {
  const fills = toFills(orders);
  if (fills.length === 0) {
    return { points: [], missingSymbols: [], symbols: [], benchmarkSymbols: [] };
  }

  const symbols = [...new Set(fills.map((fill) => fill.symbol))];
  const priced = symbols.filter((symbol) => (candlesBySymbol[symbol] ?? []).length > 0);
  const missingSymbols = symbols.filter((symbol) => !priced.includes(symbol)).sort();

  const firstDate = fills[0].date;
  const barsBySymbol = new Map<string, Map<string, Candle>>(
    priced.map((symbol) => [symbol, new Map(candlesBySymbol[symbol].map((candle) => [candle.date, candle]))])
  );
  const dates = [...new Set(priced.flatMap((symbol) => candlesBySymbol[symbol].map((candle) => candle.date)))]
    .filter((date) => date >= firstDate)
    .sort();

  const holdings = new Map<string, Holding>();
  const realised = new Map<string, number>();
  const lastClose = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];
  let next = 0;
  let previousValue = 0;
  let growth = 1;

  // The market comparison: every instrument with candles, from its close on the first date.
  const benchmarkSymbols = Object.keys(candlesBySymbol)
    .filter((symbol) => candlesBySymbol[symbol].length > 0)
    .sort();
  const benchmarkBars = new Map(
    benchmarkSymbols.map((symbol) => [symbol, new Map(candlesBySymbol[symbol].map((candle) => [candle.date, candle]))])
  );
  const benchmarkClose = new Map<string, number>();
  const benchmarkBase = new Map<string, number>();

  // Closes before the first fill date seed the carry-forward.
  for (const symbol of new Set([...priced, ...benchmarkSymbols])) {
    const earlier = candlesBySymbol[symbol].filter((candle) => candle.date < firstDate);
    if (earlier.length > 0) {
      lastClose.set(symbol, earlier[earlier.length - 1].close);
      benchmarkClose.set(symbol, earlier[earlier.length - 1].close);
    }
  }

  for (const date of dates) {
    const trades: PortfolioHistoryTrade[] = [];
    let bought = 0;
    let sold = 0;
    while (next < fills.length && fills[next].date <= date) {
      const fill = fills[next++];
      // A symbol without candles is left out of value and cost, so it stays out of everything else too.
      if (!priced.includes(fill.symbol)) {
        apply(holdings, fill, new Map());
        continue;
      }
      apply(holdings, fill, realised);
      trades.push({ symbol: fill.symbol, side: fill.side, quantity: fill.quantity, price: fill.price });
      if (fill.side === 'BUY') {
        bought += fill.quantity * fill.price;
      } else {
        sold += fill.quantity * fill.price;
      }
    }

    let marketValue = 0;
    let costBasis = 0;
    let synthetic = false;
    const pnlBySymbol: Record<string, number> = {};
    for (const symbol of priced) {
      const bar = barsBySymbol.get(symbol)?.get(date);
      if (bar) {
        lastClose.set(symbol, bar.close);
      }
      const held = holdings.get(symbol);
      let unrealised = 0;
      if (held && held.quantity > 0) {
        const close = lastClose.get(symbol) ?? held.averageCost;
        marketValue += held.quantity * close;
        costBasis += held.quantity * held.averageCost;
        unrealised = held.quantity * (close - held.averageCost);
        synthetic ||= !bar || bar.synthetic;
      }
      if (held) {
        pnlBySymbol[symbol] = cents(unrealised + (realised.get(symbol) ?? 0));
      }
    }

    // Time-weighted: the day's change in value, net of the day's trades, over what was held during it.
    const invested = previousValue > 0 ? previousValue : bought;
    const dailyReturn = invested > 0 ? (marketValue - previousValue - bought + sold) / invested : 0;
    growth *= 1 + dailyReturn;
    previousValue = marketValue;

    const realisedPnl = cents([...realised.values()].reduce((sum, value) => sum + value, 0));
    points.push({
      date,
      marketValue: cents(marketValue),
      costBasis: cents(costBasis),
      realisedPnl,
      totalPnl: cents(marketValue - costBasis + realisedPnl),
      pnlBySymbol,
      returnPct: cents((growth - 1) * 100),
      marketReturnPct: marketReturn(date, benchmarkSymbols, benchmarkBars, benchmarkClose, benchmarkBase),
      synthetic,
      trades
    });
  }

  return { points, missingSymbols, symbols: priced, benchmarkSymbols };
}

/** Equal-weight buy-and-hold return of the comparison instruments since the first date, in per cent. */
function marketReturn(
  date: string,
  symbols: string[],
  bars: Map<string, Map<string, Candle>>,
  lastClose: Map<string, number>,
  base: Map<string, number>
): number | null {
  const returns: number[] = [];
  for (const symbol of symbols) {
    const bar = bars.get(symbol)?.get(date);
    if (bar) {
      lastClose.set(symbol, bar.close);
    }
    const close = lastClose.get(symbol);
    if (close === undefined) {
      continue;
    }
    if (!base.has(symbol)) {
      base.set(symbol, close);
    }
    returns.push(close / (base.get(symbol) as number) - 1);
  }
  return returns.length === 0 ? null : cents((returns.reduce((sum, r) => sum + r, 0) / returns.length) * 100);
}

/** FILLED buys and sells with a price, oldest first. */
function toFills(orders: Order[]): Fill[] {
  return orders
    .filter((order) => order.status === 'FILLED' && (order.side === 'BUY' || order.side === 'SELL'))
    .map((order) => ({ order, price: order.executedPrice ?? order.price }))
    .filter(({ price }) => price !== null && price !== undefined)
    .map(({ order, price }) => {
      const at = new Date(order.createdOn);
      return {
        symbol: order.symbol.toUpperCase(),
        side: order.side as 'BUY' | 'SELL',
        quantity: order.quantity,
        price: price as number,
        date: at.toISOString().slice(0, 10),
        at: at.getTime()
      };
    })
    .sort((a, b) => a.at - b.at);
}

function apply(holdings: Map<string, Holding>, fill: Fill, realised: Map<string, number>): void {
  const held = holdings.get(fill.symbol) ?? { quantity: 0, averageCost: 0 };
  if (fill.side === 'BUY') {
    const quantity = held.quantity + fill.quantity;
    held.averageCost = cents((held.averageCost * held.quantity + fill.price * fill.quantity) / quantity);
    held.quantity = quantity;
  } else {
    // Booked at the moment of sale against the average cost, as SettlementService does.
    const sold = Math.min(fill.quantity, held.quantity);
    realised.set(fill.symbol, (realised.get(fill.symbol) ?? 0) + (fill.price - held.averageCost) * sold);
    held.quantity = Math.max(0, held.quantity - fill.quantity);
    if (held.quantity === 0) {
      held.averageCost = 0;
    }
  }
  holdings.set(fill.symbol, held);
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
