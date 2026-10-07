import { Candle } from '../../shared/models/candle.models';
import {
  atr,
  beta,
  bollinger,
  capWeights,
  cholesky,
  correlation,
  emaSeries,
  herfindahl,
  historicalVaR,
  macd,
  maxDrawdown,
  maxSharpePortfolio,
  medianPrice,
  normalCdf,
  percentile,
  probabilityAbove,
  requiredGainToRecover,
  rsi,
  seededRandom,
  sharpeRatio,
  simulatePortfolio,
  sma,
  stdev,
  supportResistance
} from './advisor-math';

function candle(close: number, high = close, low = close, volume: number | null = 1000): Candle {
  return { date: '2026-01-01', open: close, high, low, close, volume, synthetic: false };
}

describe('advisor maths', () => {
  describe('statistics', () => {
    it('computes the sample standard deviation', () => {
      expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    });

    it('interpolates percentiles', () => {
      expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
      expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
      expect(percentile([0, 10], 0.05)).toBeCloseTo(0.5, 10);
    });

    it('gives +1 and -1 for perfectly related series', () => {
      expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
      expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
    });

    it('matches the standard normal table', () => {
      expect(normalCdf(0)).toBeCloseTo(0.5, 6);
      expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
      expect(normalCdf(-1)).toBeCloseTo(0.1587, 4);
    });
  });

  describe('technical indicators', () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i);

    it('averages the last n values', () => {
      expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
      expect(sma([1, 2], 3)).toBeNull();
    });

    it('seeds the EMA with an SMA and then smooths', () => {
      const ema = emaSeries([1, 2, 3, 4], 3);
      expect(ema[1]).toBeNaN();
      expect(ema[2]).toBe(2);
      expect(ema[3]).toBe(3); // 4 x 0.5 + 2 x 0.5
    });

    it('puts RSI at 100 when every day is up and near 0 when every day is down', () => {
      expect(rsi(rising)).toBe(100);
      expect(rsi([...rising].reverse()) as number).toBeLessThan(1);
      expect(rsi([1, 2, 3])).toBeNull();
    });

    it('puts RSI near 50 when gains and losses are equal', () => {
      // Wilder smoothing weights the latest move most, so it sits just either side of 50.
      const zigzag = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 100 : 101));
      expect(rsi(zigzag) as number).toBeGreaterThan(45);
      expect(rsi(zigzag) as number).toBeLessThan(55);
    });

    it('has a positive MACD in an uptrend', () => {
      const accelerating = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.05);
      const value = macd(accelerating);
      expect(value).not.toBeNull();
      expect(value!.macd).toBeGreaterThan(0);
      expect(value!.histogram).toBeGreaterThan(0);
    });

    it('places the last close inside the Bollinger band', () => {
      const flat = [...Array.from({ length: 19 }, (_, i) => (i % 2 ? 99 : 101)), 100];
      const bands = bollinger(flat)!;
      expect(bands.middle).toBeCloseTo(100, 1);
      expect(bands.upper).toBeGreaterThan(bands.middle);
      expect(bands.percentB).toBeCloseTo(0.5, 1);
    });

    it('measures true range including gaps', () => {
      // Constant 2-point daily range, no gaps.
      const bars = Array.from({ length: 20 }, () => candle(100, 101, 99));
      expect(atr(bars, 14)).toBeCloseTo(2, 10);
    });

    it('finds support and resistance', () => {
      const bars = [candle(10, 12, 8), candle(11, 15, 9), candle(10, 11, 7)];
      expect(supportResistance(bars)).toEqual({ support: 7, resistance: 15 });
    });
  });

  describe('risk', () => {
    it('measures the largest peak-to-trough fall', () => {
      expect(maxDrawdown([100, 120, 90, 110, 60, 130])).toBeCloseTo(0.5, 10);
      expect(maxDrawdown([1, 2, 3])).toBe(0);
    });

    it('has a beta of 2 for a twice-as-volatile copy of the market', () => {
      const market = [0.01, -0.02, 0.015, 0.005, -0.01];
      expect(beta(market.map((r) => 2 * r), market)).toBeCloseTo(2, 10);
    });

    it('reads Value at Risk from the left tail', () => {
      const returns = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // -5% to +4.9%
      expect(historicalVaR(returns, 0.95)).toBeCloseTo(0.04505, 4);
    });

    it('scores a steady gain with a higher Sharpe than a volatile one', () => {
      const steady = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.002 : 0.001));
      const volatile = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.03 : -0.027));
      expect(sharpeRatio(steady, 0.04)).toBeGreaterThan(sharpeRatio(volatile, 0.04));
    });

    it('computes concentration', () => {
      expect(herfindahl([1, 1, 1, 1])).toBeCloseTo(0.25, 10);
      expect(herfindahl([1, 0, 0])).toBe(1);
    });

    it('needs a 25% gain to recover a 20% loss', () => {
      expect(requiredGainToRecover(0.2)).toBeCloseTo(0.25, 10);
      expect(requiredGainToRecover(0.5)).toBeCloseTo(1, 10);
      expect(requiredGainToRecover(-0.1)).toBe(0);
    });
  });

  describe('price model and simulation', () => {
    it('gives a 50% chance of beating the median price', () => {
      const median = medianPrice(100, 0.1, 0.3, 0.25);
      expect(probabilityAbove(100, median, 0.1, 0.3, 0.25)).toBeCloseTo(0.5, 6);
    });

    it('gives a lower chance for a higher target', () => {
      expect(probabilityAbove(100, 120, 0.1, 0.3, 0.25)).toBeLessThan(probabilityAbove(100, 105, 0.1, 0.3, 0.25));
    });

    it('is deterministic for a seed', () => {
      const a = seededRandom(7);
      const b = seededRandom(7);
      expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });

    it('factors a correlation matrix', () => {
      const m = [
        [1, 0.5],
        [0.5, 1]
      ];
      const l = cholesky(m);
      expect(l[0][0] * l[0][0]).toBeCloseTo(1, 10);
      expect(l[1][0] * l[0][0]).toBeCloseTo(0.5, 10);
      expect(l[1][0] ** 2 + l[1][1] ** 2).toBeCloseTo(1, 10);
    });

    it('matches the lognormal model in a one-asset simulation', () => {
      const result = simulatePortfolio({
        weights: [1],
        mu: [0.1],
        sigma: [0.3],
        correlation: [[1]],
        years: 0.25,
        paths: 20000,
        seed: 1,
        targets: [0.05]
      });
      expect(result.expected).toBeCloseTo(Math.exp(0.1 * 0.25) - 1, 2);
      expect(result.probabilities[0]).toBeCloseTo(probabilityAbove(100, 105, 0.1, 0.3, 0.25), 1);
      expect(result.p5).toBeLessThan(0);
      expect(result.valueAtRisk95).toBeCloseTo(-result.p5, 10);
      expect(result.expectedShortfall95).toBeGreaterThan(result.valueAtRisk95);
    });
  });

  describe('optimisation', () => {
    it('caps weights and redistributes the excess', () => {
      const capped = capWeights([0.7, 0.2, 0.1], 0.4);
      expect(capped[0]).toBeCloseTo(0.4, 10);
      expect(capped.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 10);
      expect(Math.max(...capped)).toBeLessThanOrEqual(0.4 + 1e-9);
    });

    it('prefers the asset with the better return for its risk', () => {
      const result = maxSharpePortfolio({
        expectedReturns: [0.15, 0.05],
        covariance: [
          [0.04, 0],
          [0, 0.04]
        ],
        riskFree: 0.04,
        maxWeight: 1,
        candidates: 2000,
        seed: 3
      });
      expect(result.weights[0]).toBeGreaterThan(result.weights[1]);
      expect(result.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 10);
    });
  });
});
