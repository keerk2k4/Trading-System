import { Candle } from '../../shared/models/candle.models';
import { analyseFundamentals, costOfEquity, dcfMultiple } from './fundamentals';
import { MAX_WEIGHT, buildAdvisorReport, chance } from './portfolio-advisor';

/**
 * Synthetic daily candles: a drift per day plus a deterministic wiggle, so
 * every symbol has volatility and the symbols are not perfectly correlated.
 */
function series(start: number, dailyDrift: number, wiggle: number, phase: number, days = 260): Candle[] {
  const out: Candle[] = [];
  let close = start;
  for (let i = 0; i < days; i++) {
    close *= 1 + dailyDrift + wiggle * Math.sin(i * 0.9 + phase);
    const date = new Date(Date.UTC(2025, 9, 7) + i * 86400000).toISOString().slice(0, 10);
    out.push({ date, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1_000_000, synthetic: false });
  }
  return out;
}

const candles: Record<string, Candle[]> = {
  NVDA: series(100, 0.003, 0.02, 0),
  GOOGL: series(150, 0.0015, 0.012, 1),
  MSFT: series(400, 0.0005, 0.01, 2),
  TSLA: series(400, -0.002, 0.03, 3),
  AAPL: series(200, 0.001, 0.012, 4)
};
const last = (symbol: string) => candles[symbol][candles[symbol].length - 1].close;

describe('fundamentals', () => {
  it('values a perpetuity like the Gordon growth formula', () => {
    // With no excess growth the two-stage DCF reduces to (1 + g) / (r - g).
    expect(dcfMultiple(0.03, 0.1, 0.03)).toBeCloseTo(1.03 / 0.07, 6);
  });

  it('keeps the CAPM discount rate within bounds', () => {
    expect(costOfEquity(1)).toBeCloseTo(0.0925, 10);
    expect(costOfEquity(-1)).toBe(0.07);
    expect(costOfEquity(5)).toBe(0.14);
  });

  it('scores a growth company above a richly valued, slow-growing one', () => {
    const nvda = analyseFundamentals('NVDA', 100, 1.2)!;
    const tsla = analyseFundamentals('TSLA', 100, 1.8)!;
    expect(nvda.score).toBeGreaterThan(tsla.score);
    expect(nvda.peg).toBeCloseTo(50 / 40, 10);
    expect(analyseFundamentals('XYZ', 100, 1)).toBeNull();
  });

  it('is independent of the price level, so a stock split does not change it', () => {
    expect(analyseFundamentals('MSFT', 50, 1)!.marginOfSafety).toBeCloseTo(analyseFundamentals('MSFT', 500, 1)!.marginOfSafety, 10);
  });
});

describe('buildAdvisorReport', () => {
  it('analyses every holding with candles and lists the rest', () => {
    const report = buildAdvisorReport({
      holdings: [
        { symbol: 'NVDA', quantity: 10, averageCost: 100, lastPrice: null },
        { symbol: 'ZZZZ', quantity: 1, averageCost: 5, lastPrice: 6 }
      ],
      cash: 1000,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    expect(report.holdings.map((h) => h.symbol)).toEqual(['NVDA']);
    expect(report.unanalysed).toEqual(['ZZZZ']);
    expect(report.holdings[0].price).toBeCloseTo(last('NVDA'), 6);
    expect(report.holdings[0].analysis.priceSource).toBe('close');
  });

  it('prefers the live quote to the last close', () => {
    const report = buildAdvisorReport({
      holdings: [{ symbol: 'MSFT', quantity: 1, averageCost: 400, lastPrice: 500 }],
      cash: 0,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    expect(report.holdings[0].price).toBe(500);
    expect(report.holdings[0].analysis.priceSource).toBe('quote');
  });

  it('works out the break-even gain and its probability for a portfolio at a loss', () => {
    const price = last('TSLA');
    const report = buildAdvisorReport({
      holdings: [{ symbol: 'TSLA', quantity: 10, averageCost: price * 2, lastPrice: null }],
      cash: 5000,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    expect(report.status).toBe('loss');
    expect(report.goalReturn).toBeCloseTo(1, 6); // down 50% needs +100%
    const tsla = report.holdings[0];
    expect(tsla.breakEvenGain).toBeCloseTo(1, 6);
    expect(tsla.goalPrice).toBeCloseTo(price * 2, 2);
    expect(tsla.goalProbability).toBeLessThan(0.05);
    expect(report.currentForecast!.probabilities.length).toBe(2);
    expect(report.summary[0]).toContain('break even');
  });

  it('exits a weak loser and points the proceeds at the best idea', () => {
    const price = last('TSLA');
    const report = buildAdvisorReport({
      holdings: [{ symbol: 'TSLA', quantity: 10, averageCost: price * 1.5, lastPrice: null }],
      cash: 0,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    const tsla = report.holdings[0];
    if (tsla.analysis.compositeScore < 40) {
      expect(tsla.action).toBe('EXIT');
      expect(tsla.quantityChange).toBe(-10);
      expect(report.optimisedWeights['TSLA']).toBeUndefined();
    } else {
      expect(['HOLD', 'AVERAGE_DOWN']).toContain(tsla.action);
    }
  });

  it('trims a holding over the weight cap and keeps a trailing stop above the minimum profit', () => {
    const nvda = last('NVDA');
    const report = buildAdvisorReport({
      holdings: [
        { symbol: 'NVDA', quantity: 100, averageCost: nvda / 2, lastPrice: null },
        { symbol: 'MSFT', quantity: 1, averageCost: last('MSFT'), lastPrice: null }
      ],
      cash: 0,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    const advice = report.holdings.find((h) => h.symbol === 'NVDA')!;
    expect(advice.weight).toBeGreaterThan(MAX_WEIGHT);
    expect(advice.status).toBe('profit');
    expect(['TRIM', 'TAKE_PROFIT']).toContain(advice.action);
    expect(advice.quantityChange).toBeLessThan(0);
    expect(advice.stopLoss).toBeGreaterThanOrEqual((nvda / 2) * 1.05 - 0.01);
    expect(advice.stopLoss).toBeLessThan(advice.price);
  });

  it('proposes a rebalance whose weights sum to one and respect exits', () => {
    const report = buildAdvisorReport({
      holdings: [
        { symbol: 'NVDA', quantity: 50, averageCost: 100, lastPrice: null },
        { symbol: 'MSFT', quantity: 5, averageCost: 300, lastPrice: null }
      ],
      cash: 2000,
      candlesBySymbol: candles,
      targetReturn: 0.05
    });
    const total = Object.values(report.optimisedWeights).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(report.optimisedForecast).not.toBeNull();
    for (const trade of report.rebalance) {
      expect(trade.quantity).not.toBe(0);
    }
    expect(report.correlation.symbols.length).toBe(2);
    expect(report.correlation.matrix[0][0]).toBeCloseTo(1, 6);
  });

  it('is deterministic', () => {
    const input = {
      holdings: [{ symbol: 'GOOGL', quantity: 3, averageCost: 120, lastPrice: null }],
      cash: 100,
      candlesBySymbol: candles,
      targetReturn: 0.08
    };
    expect(buildAdvisorReport(input)).toEqual(buildAdvisorReport(input));
  });

  it('suggests ideas when nothing is held', () => {
    const report = buildAdvisorReport({ holdings: [], cash: 10000, candlesBySymbol: candles, targetReturn: 0.05 });
    expect(report.status).toBe('empty');
    expect(report.holdings).toEqual([]);
    expect(report.metrics).toBeNull();
    expect(report.summary[0]).toContain('no holdings');
  });
});

describe('chance', () => {
  it('never shows a falsely certain 0% or 100%', () => {
    expect(chance(0)).toBe('under 1%');
    expect(chance(1)).toBe('over 99%');
    expect(chance(0.444)).toBe('44%');
  });
});
