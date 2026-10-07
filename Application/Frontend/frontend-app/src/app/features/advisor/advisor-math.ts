import { Candle } from '../../shared/models/candle.models';

/**
 * The mathematics behind the portfolio advisor: technical indicators, risk
 * and return statistics, a lognormal price model, Monte Carlo simulation and
 * a long-only mean-variance search. Every function is pure and deterministic
 * (the simulations take a seed), so the advice for the same inputs is the
 * same on every load and in every test.
 *
 * Conventions: series are oldest first; returns are simple daily returns
 * unless named log; "annualised" assumes 252 trading days.
 */

export const TRADING_DAYS = 252;

// ---------------------------------------------------------------------------
// Basic statistics
// ---------------------------------------------------------------------------

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation (n - 1). */
export function stdev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return 0;
  }
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (a[i] - ma) * (b[i] - mb);
  }
  return sum / (n - 1);
}

/** Pearson correlation, in [-1, 1]; 0 when either series is flat. */
export function correlation(a: number[], b: number[]): number {
  const sa = stdev(a);
  const sb = stdev(b);
  return sa === 0 || sb === 0 ? 0 : clamp(covariance(a, b) / (sa * sb), -1, 1);
}

/** Linear-interpolated percentile, p in [0, 1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((x, y) => x - y);
  const index = clamp(p, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 26.2.17, error < 7.5e-8). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}

// ---------------------------------------------------------------------------
// Technical indicators
// ---------------------------------------------------------------------------

/** Simple moving average of the last `period` values; null when there are too few. */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) {
    return null;
  }
  return mean(values.slice(-period));
}

/**
 * Exponential moving average series, k = 2 / (period + 1), seeded with the
 * SMA of the first `period` values. Entries before the seed are NaN.
 */
export function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length < period) {
    return out;
  }
  const k = 2 / (period + 1);
  let ema = mean(values.slice(0, period));
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * Relative Strength Index with Wilder's smoothing:
 * RS = average gain / average loss over `period`, RSI = 100 - 100 / (1 + RS).
 */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) {
    return null;
  }
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (loss === 0) {
    return gain === 0 ? 50 : 100;
  }
  return 100 - 100 / (1 + gain / loss);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

/** MACD = EMA(fast) - EMA(slow); signal = EMA(signalPeriod) of MACD; histogram = MACD - signal. */
export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): Macd | null {
  if (closes.length < slow + signalPeriod) {
    return null;
  }
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const line = closes.map((_, i) => fastEma[i] - slowEma[i]).slice(slow - 1);
  const signal = emaSeries(line, signalPeriod);
  const last = line.length - 1;
  return { macd: line[last], signal: signal[last], histogram: line[last] - signal[last] };
}

export interface Bollinger {
  middle: number;
  upper: number;
  lower: number;
  /** Where the last close sits in the band: 0 at the lower band, 1 at the upper. */
  percentB: number;
}

/** Bollinger Bands: SMA(period) +/- k population standard deviations. */
export function bollinger(closes: number[], period = 20, k = 2): Bollinger | null {
  if (closes.length < period) {
    return null;
  }
  const window = closes.slice(-period);
  const middle = mean(window);
  const sd = Math.sqrt(window.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period);
  const upper = middle + k * sd;
  const lower = middle - k * sd;
  const last = closes[closes.length - 1];
  return { middle, upper, lower, percentB: upper === lower ? 0.5 : (last - lower) / (upper - lower) };
}

/** Average True Range with Wilder's smoothing; TR = max(high - low, |high - prevClose|, |low - prevClose|). */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) {
    return null;
  }
  const tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  let value = mean(tr.slice(0, period));
  for (let i = period; i < tr.length; i++) {
    value = (value * (period - 1) + tr[i]) / period;
  }
  return value;
}

/** Support and resistance as the lowest low and highest high of the last `lookback` bars. */
export function supportResistance(candles: Candle[], lookback = 60): { support: number; resistance: number } | null {
  if (candles.length === 0) {
    return null;
  }
  const window = candles.slice(-lookback);
  return {
    support: Math.min(...window.map((c) => c.low)),
    resistance: Math.max(...window.map((c) => c.high))
  };
}

/**
 * On-Balance Volume trend: the least-squares slope of OBV over the last
 * `lookback` bars, scaled by average volume. Positive means volume is
 * flowing in on up days. Null when volume is missing.
 */
export function obvSlope(candles: Candle[], lookback = 20): number | null {
  if (candles.length < lookback + 1 || candles.some((c) => c.volume === null)) {
    return null;
  }
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const direction = Math.sign(candles[i].close - candles[i - 1].close);
    obv.push(obv[i - 1] + direction * (candles[i].volume as number));
  }
  const window = obv.slice(-lookback);
  const avgVolume = mean(candles.slice(-lookback).map((c) => c.volume as number));
  return avgVolume === 0 ? 0 : linearSlope(window) / avgVolume;
}

/** Least-squares slope of y against x = 0, 1, 2, ... */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const mx = (n - 1) / 2;
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i] - my);
    den += (i - mx) ** 2;
  }
  return num / den;
}

/** Percentage change over the last `days` bars. */
export function momentum(closes: number[], days: number): number | null {
  if (closes.length <= days) {
    return null;
  }
  const start = closes[closes.length - 1 - days];
  return start === 0 ? null : closes[closes.length - 1] / start - 1;
}

// ---------------------------------------------------------------------------
// Returns and risk
// ---------------------------------------------------------------------------

export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push(closes[i] / closes[i - 1] - 1);
  }
  return out;
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/** Annualised volatility: daily standard deviation x sqrt(252). */
export function annualisedVolatility(dailyReturns: number[]): number {
  return stdev(dailyReturns) * Math.sqrt(TRADING_DAYS);
}

/** Annualised drift of log prices: mean daily log return x 252. */
export function annualisedLogDrift(dailyLogReturns: number[]): number {
  return mean(dailyLogReturns) * TRADING_DAYS;
}

/** Sharpe ratio: (annualised return - risk-free) / annualised volatility. */
export function sharpeRatio(dailyReturns: number[], riskFree: number): number {
  const vol = annualisedVolatility(dailyReturns);
  return vol === 0 ? 0 : (mean(dailyReturns) * TRADING_DAYS - riskFree) / vol;
}

/** Sortino ratio: like Sharpe, but divides by downside deviation only. */
export function sortinoRatio(dailyReturns: number[], riskFree: number): number {
  const dailyRf = riskFree / TRADING_DAYS;
  const downside = dailyReturns.map((r) => Math.min(r - dailyRf, 0));
  const dd = Math.sqrt(mean(downside.map((d) => d * d))) * Math.sqrt(TRADING_DAYS);
  return dd === 0 ? 0 : (mean(dailyReturns) * TRADING_DAYS - riskFree) / dd;
}

/** Largest peak-to-trough fall, as a positive fraction (0.25 = a 25% drawdown). */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const close of closes) {
    peak = Math.max(peak, close);
    worst = Math.max(worst, peak > 0 ? 1 - close / peak : 0);
  }
  return worst;
}

/** Beta = Cov(asset, market) / Var(market). */
export function beta(assetReturns: number[], marketReturns: number[]): number {
  const variance = covariance(marketReturns, marketReturns);
  return variance === 0 ? 1 : covariance(assetReturns, marketReturns) / variance;
}

/** Historical Value at Risk: the loss not exceeded with the given confidence, as a positive fraction. */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  return Math.max(0, -percentile(returns, 1 - confidence));
}

/** Herfindahl-Hirschman index of weights: sum of w^2. 1/HHI is the "effective number" of holdings. */
export function herfindahl(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  return total === 0 ? 0 : weights.reduce((s, w) => s + (w / total) ** 2, 0);
}

/** Gain needed to recover a loss: L / (1 - L). A 20% loss needs a 25% gain. */
export function requiredGainToRecover(lossFraction: number): number {
  if (lossFraction <= 0) {
    return 0;
  }
  return lossFraction >= 1 ? Infinity : lossFraction / (1 - lossFraction);
}

// ---------------------------------------------------------------------------
// Price model: geometric Brownian motion
// ---------------------------------------------------------------------------

/**
 * Under GBM, ln(S_T / S_0) ~ N((mu - sigma^2 / 2) T, sigma^2 T), so the
 * probability of finishing at or above K is N(d2) with
 *   d2 = (ln(S_0 / K) + (mu - sigma^2 / 2) T) / (sigma sqrt(T)).
 * mu and sigma are annual; T is in years.
 */
export function probabilityAbove(spot: number, level: number, mu: number, sigma: number, years: number): number {
  if (level <= 0) {
    return 1;
  }
  if (sigma <= 0 || years <= 0) {
    return spot * Math.exp(mu * years) >= level ? 1 : 0;
  }
  const d2 = (Math.log(spot / level) + (mu - (sigma * sigma) / 2) * years) / (sigma * Math.sqrt(years));
  return normalCdf(d2);
}

/** Median GBM price at T: S_0 exp((mu - sigma^2 / 2) T). */
export function medianPrice(spot: number, mu: number, sigma: number, years: number): number {
  return spot * Math.exp((mu - (sigma * sigma) / 2) * years);
}

// ---------------------------------------------------------------------------
// Random numbers and simulation
// ---------------------------------------------------------------------------

/** Mulberry32: a small, fast, seedable PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws by the Box-Muller transform. */
export function gaussian(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    while (u === 0) {
      u = random();
    }
    const v = random();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}

/**
 * Cholesky factor L of a symmetric positive semi-definite matrix (A = L L^T).
 * A tiny ridge keeps near-singular correlation matrices factorable.
 */
export function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) {
        sum -= l[i][k] * l[j][k];
      }
      if (i === j) {
        l[i][j] = Math.sqrt(Math.max(sum, 1e-10));
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  return l;
}

export interface SimulationInput {
  weights: number[];
  /** Annual drift per asset. */
  mu: number[];
  /** Annual volatility per asset. */
  sigma: number[];
  correlation: number[][];
  years: number;
  paths: number;
  seed: number;
  /** Portfolio returns to compute the probability of reaching, e.g. [break-even, target]. */
  targets: number[];
}

export interface SimulationResult {
  expected: number;
  median: number;
  p5: number;
  p95: number;
  /** Probability of a return at or above each of the input targets, in order. */
  probabilities: number[];
  probabilityOfLoss: number;
  /** 95% Value at Risk over the horizon, as a positive fraction. */
  valueAtRisk95: number;
  /** Mean loss in the worst 5% of paths (expected shortfall / CVaR). */
  expectedShortfall95: number;
}

/**
 * Monte Carlo of a buy-and-hold portfolio over the horizon. Each asset ends
 * at exp((mu - sigma^2 / 2) T + sigma sqrt(T) Z) of its start, with the Z
 * correlated through the Cholesky factor of the correlation matrix; the
 * portfolio return is the weighted sum of asset returns.
 */
export function simulatePortfolio(input: SimulationInput): SimulationResult {
  const n = input.weights.length;
  const total = input.weights.reduce((s, w) => s + w, 0) || 1;
  const weights = input.weights.map((w) => w / total);
  const l = cholesky(input.correlation);
  const normal = gaussian(seededRandom(input.seed));
  const sqrtT = Math.sqrt(input.years);
  const outcomes: number[] = [];

  for (let p = 0; p < input.paths; p++) {
    const z = Array.from({ length: n }, () => normal());
    let portfolioReturn = 0;
    for (let i = 0; i < n; i++) {
      let correlated = 0;
      for (let k = 0; k <= i; k++) {
        correlated += l[i][k] * z[k];
      }
      const growth = Math.exp((input.mu[i] - input.sigma[i] ** 2 / 2) * input.years + input.sigma[i] * sqrtT * correlated);
      portfolioReturn += weights[i] * (growth - 1);
    }
    outcomes.push(portfolioReturn);
  }

  const p5 = percentile(outcomes, 0.05);
  const tail = outcomes.filter((r) => r <= p5);
  return {
    expected: mean(outcomes),
    median: percentile(outcomes, 0.5),
    p5,
    p95: percentile(outcomes, 0.95),
    probabilities: input.targets.map((t) => outcomes.filter((r) => r >= t).length / outcomes.length),
    probabilityOfLoss: outcomes.filter((r) => r < 0).length / outcomes.length,
    valueAtRisk95: Math.max(0, -p5),
    expectedShortfall95: Math.max(0, -mean(tail))
  };
}

// ---------------------------------------------------------------------------
// Mean-variance optimisation (Markowitz)
// ---------------------------------------------------------------------------

export interface OptimisationInput {
  /** Annual expected arithmetic return per asset. */
  expectedReturns: number[];
  /** Annual covariance matrix. */
  covariance: number[][];
  riskFree: number;
  /** No single weight above this. */
  maxWeight: number;
  candidates: number;
  seed: number;
}

export interface OptimisationResult {
  weights: number[];
  expectedReturn: number;
  volatility: number;
  sharpe: number;
}

export function portfolioStats(weights: number[], expectedReturns: number[], cov: number[][]): { expectedReturn: number; volatility: number } {
  let expectedReturn = 0;
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    expectedReturn += weights[i] * expectedReturns[i];
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * cov[i][j];
    }
  }
  return { expectedReturn, volatility: Math.sqrt(Math.max(variance, 0)) };
}

/**
 * Long-only maximum-Sharpe portfolio found by sampling the efficient frontier:
 * random weight vectors from a flat Dirichlet (normalised exponentials),
 * capped at maxWeight, keeping the one with the highest
 * (E[R] - rf) / sigma. Simple, robust, and good enough for a handful of assets.
 */
export function maxSharpePortfolio(input: OptimisationInput): OptimisationResult {
  const n = input.expectedReturns.length;
  const random = seededRandom(input.seed);
  const evaluate = (weights: number[]): OptimisationResult => {
    const stats = portfolioStats(weights, input.expectedReturns, input.covariance);
    const sharpe = stats.volatility === 0 ? 0 : (stats.expectedReturn - input.riskFree) / stats.volatility;
    return { weights, ...stats, sharpe };
  };

  const cap = Math.max(input.maxWeight, 1 / n);
  let best = evaluate(new Array<number>(n).fill(1 / n));
  for (let c = 0; c < input.candidates; c++) {
    const draws = Array.from({ length: n }, () => -Math.log(1 - random()));
    const weights = capWeights(normalise(draws), cap);
    const candidate = evaluate(weights);
    if (candidate.sharpe > best.sharpe) {
      best = candidate;
    }
  }
  return best;
}

function normalise(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  return values.map((v) => (total === 0 ? 1 / values.length : v / total));
}

/** Cap each weight and spread the excess over the uncapped ones, repeating until none exceeds the cap. */
export function capWeights(weights: number[], cap: number): number[] {
  const out = [...weights];
  for (let pass = 0; pass < out.length; pass++) {
    const excess = out.reduce((s, w) => s + Math.max(w - cap, 0), 0);
    if (excess <= 1e-12) {
      break;
    }
    const free = out.map((w) => w < cap);
    const freeTotal = out.reduce((s, w, i) => s + (free[i] ? w : 0), 0);
    for (let i = 0; i < out.length; i++) {
      if (!free[i]) {
        out[i] = cap;
      } else {
        out[i] += freeTotal === 0 ? excess / free.filter(Boolean).length : (excess * out[i]) / freeTotal;
      }
    }
  }
  return out;
}
