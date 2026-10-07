import { Candle } from '../../shared/models/candle.models';
import { Order } from '../../shared/models/order.models';
import { buildPortfolioHistory } from './portfolio-history';

function candle(date: string, close: number, synthetic = false): Candle {
  return { date, open: close, high: close, low: close, close, volume: 1, synthetic };
}

function fill(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number, createdOn: string): Order {
  return {
    orderId: `ORD-${createdOn}`,
    accountId: 6,
    symbol,
    side,
    quantity,
    price,
    executedPrice: price,
    status: 'FILLED',
    createdOn
  };
}

describe('buildPortfolioHistory', () => {
  it('returns nothing before the first filled order', () => {
    expect(buildPortfolioHistory([], { AAPL: [candle('2026-04-08', 258.9)] })).toEqual({ points: [], missingSymbols: [], symbols: [], benchmarkSymbols: [] });
  });

  it('values holdings at each close against a weighted average cost', () => {
    const orders = [
      fill('AAPL', 'BUY', 10, 258.9, '2026-04-08T19:55:00Z'),
      fill('AAPL', 'BUY', 5, 314.86, '2026-04-10T19:55:00Z')
    ];
    const candles = {
      AAPL: [candle('2026-04-07', 250), candle('2026-04-08', 258.9), candle('2026-04-09', 270), candle('2026-04-10', 314.86)]
    };

    const { points } = buildPortfolioHistory(orders, candles);

    expect(points.map((p) => p.date)).toEqual(['2026-04-08', '2026-04-09', '2026-04-10']);
    expect(points[0]).toEqual(
      jasmine.objectContaining({ marketValue: 2589, costBasis: 2589, trades: [{ symbol: 'AAPL', side: 'BUY', quantity: 10, price: 258.9 }] })
    );
    expect(points[1]).toEqual(jasmine.objectContaining({ marketValue: 2700, costBasis: 2589, trades: [] }));
    // (10 x 258.90 + 5 x 314.86) / 15 = 277.55, as SettlementService rounds it.
    expect(points[2]).toEqual(jasmine.objectContaining({ marketValue: 4722.9, costBasis: 4163.25 }));
  });

  it('keeps the average cost on a sale and only reduces the quantity', () => {
    const orders = [
      fill('NVDA', 'BUY', 20, 207.41, '2026-06-16T19:55:00Z'),
      fill('NVDA', 'SELL', 10, 219.74, '2026-06-17T19:55:00Z')
    ];
    const { points } = buildPortfolioHistory(orders, {
      NVDA: [candle('2026-06-16', 207.41), candle('2026-06-17', 219.74)]
    });

    // Realised (219.74 - 207.41) x 10 = 123.30 is booked at the sale; total P&L carries straight on.
    expect(points[1]).toEqual(
      jasmine.objectContaining({ marketValue: 2197.4, costBasis: 2074.1, realisedPnl: 123.3, totalPnl: 246.6 })
    );
    expect(points[1].trades[0].side).toBe('SELL');
  });

  it('moves total P&L with prices only: a trade at the close leaves it unchanged', () => {
    const orders = [
      fill('AAPL', 'BUY', 10, 100, '2026-05-01T19:55:00Z'),
      fill('AAPL', 'BUY', 10, 110, '2026-05-02T19:55:00Z'),
      fill('AAPL', 'SELL', 5, 110, '2026-05-03T19:55:00Z')
    ];
    const { points } = buildPortfolioHistory(orders, {
      AAPL: [candle('2026-05-01', 100), candle('2026-05-02', 110), candle('2026-05-03', 110)]
    });

    // Day 2: the first 10 gained 100; buying 10 more at the close adds nothing.
    // Day 3: no price move; selling 5 turns 25 of unrealised into realised.
    expect(points.map((p) => [p.marketValue, p.totalPnl, p.realisedPnl])).toEqual([
      [1000, 0, 0],
      [2200, 100, 0],
      [1650, 100, 25]
    ]);
  });

  it('splits total P&L by instrument, realised included', () => {
    const orders = [
      fill('AAPL', 'BUY', 10, 100, '2026-05-01T19:55:00Z'),
      fill('MSFT', 'BUY', 2, 50, '2026-05-01T19:55:00Z'),
      fill('AAPL', 'SELL', 4, 120, '2026-05-02T19:55:00Z')
    ];
    const { points, symbols } = buildPortfolioHistory(orders, {
      AAPL: [candle('2026-05-01', 100), candle('2026-05-02', 120)],
      MSFT: [candle('2026-05-01', 50), candle('2026-05-02', 45)]
    });

    expect(symbols).toEqual(['AAPL', 'MSFT']);
    // AAPL: 6 held at +20 = 120 unrealised, 4 sold at +20 = 80 realised; MSFT: 2 x -5.
    expect(points[1].pnlBySymbol).toEqual({ AAPL: 200, MSFT: -10 });
    expect(points[1].totalPnl).toBe(190);
  });

  it('chains a time-weighted return that buying more does not move', () => {
    const orders = [
      fill('AAPL', 'BUY', 1, 100, '2026-05-01T19:55:00Z'),
      // Ten times as much money goes in at the close of day 2.
      fill('AAPL', 'BUY', 10, 110, '2026-05-02T19:55:00Z')
    ];
    const { points } = buildPortfolioHistory(orders, {
      AAPL: [candle('2026-05-01', 100), candle('2026-05-02', 110), candle('2026-05-03', 121)]
    });

    // +10% on day 2, and the purchase adds nothing; +10% on day 3 compounds to +21%:
    // the same as the price itself, however much was bought on the way.
    expect(points.map((p) => p.returnPct)).toEqual([0, 10, 21]);
  });

  it('compares against an equal-weight buy-and-hold of every instrument with candles', () => {
    const { points, benchmarkSymbols } = buildPortfolioHistory([fill('AAPL', 'BUY', 1, 100, '2026-05-01T19:55:00Z')], {
      AAPL: [candle('2026-04-30', 90), candle('2026-05-01', 100), candle('2026-05-02', 110)],
      NFLX: [candle('2026-05-01', 50), candle('2026-05-02', 45)]
    });

    expect(benchmarkSymbols).toEqual(['AAPL', 'NFLX']);
    // From the first trade day: AAPL +10%, NFLX -10%, so the market is flat.
    expect(points.map((p) => p.marketReturnPct)).toEqual([0, 0]);
    expect(points.map((p) => p.returnPct)).toEqual([0, 10]);
  });

  it('sums several instruments and carries a missing close forward as synthetic', () => {
    const orders = [
      fill('AAPL', 'BUY', 1, 100, '2026-05-01T19:55:00Z'),
      fill('MSFT', 'BUY', 2, 50, '2026-05-01T19:55:00Z')
    ];
    const { points } = buildPortfolioHistory(orders, {
      AAPL: [candle('2026-05-01', 100), candle('2026-05-04', 110)],
      MSFT: [candle('2026-05-01', 50), candle('2026-05-02', 55), candle('2026-05-04', 60, true)]
    });

    expect(points.map((p) => [p.date, p.marketValue, p.synthetic])).toEqual([
      ['2026-05-01', 200, false],
      ['2026-05-02', 210, true], // AAPL has no bar: 100 carried forward
      ['2026-05-04', 230, true] // MSFT's bar was filled in by the provider
    ]);
  });

  it('ignores orders that did not fill and reports symbols without candles', () => {
    const orders: Order[] = [
      fill('AAPL', 'BUY', 1, 100, '2026-05-01T19:55:00Z'),
      { ...fill('AAPL', 'BUY', 99, 1, '2026-05-01T19:56:00Z'), status: 'CANCELLED' },
      fill('IBM', 'BUY', 3, 150, '2026-05-01T19:57:00Z')
    ];

    const history = buildPortfolioHistory(orders, { AAPL: [candle('2026-05-01', 100)] });

    expect(history.missingSymbols).toEqual(['IBM']);
    expect(history.points).toEqual([
      {
        date: '2026-05-01',
        marketValue: 100,
        costBasis: 100,
        realisedPnl: 0,
        totalPnl: 0,
        pnlBySymbol: { AAPL: 0 },
        returnPct: 0,
        marketReturnPct: 0,
        synthetic: false,
        trades: [{ symbol: 'AAPL', side: 'BUY', quantity: 1, price: 100 }]
      }
    ]);
  });
});
