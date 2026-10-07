import { clamp } from './advisor-math';

/**
 * Fundamental data and fundamental analysis for the advisor.
 *
 * The platform has no fundamentals feed: Fauxnance serves quotes and candles
 * only. FUNDAMENTALS is therefore a static, approximate snapshot for the
 * eight instruments with saved candles, in the same spirit as
 * public/candles/*.json. It is for demonstration, not investment research;
 * replace it with a provider (and an ETL job) before relying on it.
 *
 * Per-share figures would break on a stock split, so cash flow is held as a
 * yield (free cash flow / market capitalisation) and the DCF is computed per
 * unit of today's price. That keeps the snapshot valid at any price level.
 */
export interface Fundamentals {
  symbol: string;
  name: string;
  sector: string;
  /** Trailing price / earnings. */
  pe: number;
  /** Price / book value. */
  pb: number;
  /** Expected annual EPS growth, per cent. */
  epsGrowthPct: number;
  /** Return on equity, per cent. */
  roePct: number;
  /** Total debt / shareholders' equity. */
  debtToEquity: number;
  /** Free cash flow / market capitalisation, per cent. */
  fcfYieldPct: number;
  /** Expected free-cash-flow growth for the next five years, per cent. */
  fcfGrowthPct: number;
  dividendYieldPct: number;
  /** Piotroski F-Score, 0 to 9: nine pass/fail checks of profitability, leverage and efficiency. */
  piotroski: number;
  /** Altman Z-Score: above 3 safe, 1.8 to 3 grey zone, below 1.8 distress. */
  altmanZ: number;
}

export const FUNDAMENTALS: Readonly<Record<string, Fundamentals>> = {
  AAPL: { symbol: 'AAPL', name: 'Apple', sector: 'Technology hardware', pe: 34, pb: 50, epsGrowthPct: 10, roePct: 150, debtToEquity: 1.5, fcfYieldPct: 2.8, fcfGrowthPct: 6, dividendYieldPct: 0.4, piotroski: 7, altmanZ: 8.5 },
  AMZN: { symbol: 'AMZN', name: 'Amazon', sector: 'Consumer / cloud', pe: 33, pb: 7, epsGrowthPct: 22, roePct: 24, debtToEquity: 0.4, fcfYieldPct: 1.0, fcfGrowthPct: 20, dividendYieldPct: 0, piotroski: 6, altmanZ: 6 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication services', pe: 25, pb: 8, epsGrowthPct: 18, roePct: 33, debtToEquity: 0.1, fcfYieldPct: 2.6, fcfGrowthPct: 10, dividendYieldPct: 0.3, piotroski: 8, altmanZ: 12 },
  META: { symbol: 'META', name: 'Meta Platforms', sector: 'Communication services', pe: 27, pb: 9, epsGrowthPct: 15, roePct: 35, debtToEquity: 0.25, fcfYieldPct: 2.8, fcfGrowthPct: 8, dividendYieldPct: 0.3, piotroski: 7, altmanZ: 10 },
  MSFT: { symbol: 'MSFT', name: 'Microsoft', sector: 'Software', pe: 36, pb: 11, epsGrowthPct: 14, roePct: 33, debtToEquity: 0.2, fcfYieldPct: 2.0, fcfGrowthPct: 11, dividendYieldPct: 0.7, piotroski: 7, altmanZ: 9 },
  NFLX: { symbol: 'NFLX', name: 'Netflix', sector: 'Communication services', pe: 45, pb: 18, epsGrowthPct: 25, roePct: 40, debtToEquity: 0.6, fcfYieldPct: 2.0, fcfGrowthPct: 15, dividendYieldPct: 0, piotroski: 7, altmanZ: 7 },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', pe: 50, pb: 45, epsGrowthPct: 40, roePct: 100, debtToEquity: 0.1, fcfYieldPct: 1.7, fcfGrowthPct: 25, dividendYieldPct: 0.02, piotroski: 8, altmanZ: 40 },
  TSLA: { symbol: 'TSLA', name: 'Tesla', sector: 'Automobiles', pe: 180, pb: 15, epsGrowthPct: 10, roePct: 8, debtToEquity: 0.15, fcfYieldPct: 0.5, fcfGrowthPct: 10, dividendYieldPct: 0, piotroski: 4, altmanZ: 15 }
};

/** Assumptions of the discount rate and the DCF. */
export const RISK_FREE_RATE = 0.0425;
export const EQUITY_RISK_PREMIUM = 0.05;
export const TERMINAL_GROWTH = 0.03;

/** CAPM cost of equity, r = rf + beta x ERP, held within 7% to 14%. */
export function costOfEquity(beta: number): number {
  return clamp(RISK_FREE_RATE + beta * EQUITY_RISK_PREMIUM, 0.07, 0.14);
}

/**
 * Two-stage discounted cash flow, per unit of today's free cash flow:
 * years 1-5 grow at g1, years 6-10 fade linearly from g1 to the terminal
 * rate gT, and the terminal value is FCF_10 (1 + gT) / (r - gT) (Gordon growth).
 *
 *   V / FCF_0 = sum_{t=1..10} FCF_t / (1 + r)^t + TV / (1 + r)^10
 */
export function dcfMultiple(growth: number, discountRate: number, terminalGrowth = TERMINAL_GROWTH): number {
  const r = Math.max(discountRate, terminalGrowth + 0.01);
  let fcf = 1;
  let value = 0;
  for (let t = 1; t <= 10; t++) {
    const g = t <= 5 ? growth : growth + ((terminalGrowth - growth) * (t - 5)) / 5;
    fcf *= 1 + g;
    value += fcf / (1 + r) ** t;
  }
  const terminal = (fcf * (1 + terminalGrowth)) / (r - terminalGrowth);
  return value + terminal / (1 + r) ** 10;
}

export interface FundamentalAnalysis {
  fundamentals: Fundamentals;
  /** P/E divided by EPS growth; null when growth is not positive. */
  peg: number | null;
  discountRate: number;
  /** DCF value per share at today's price. */
  intrinsicValue: number;
  /** (intrinsic - price) / intrinsic; negative means the price is above the DCF value. */
  marginOfSafety: number;
  altmanZone: 'safe' | 'grey' | 'distress';
  /** 0 to 100, higher is healthier and cheaper. */
  score: number;
  notes: string[];
}

export function analyseFundamentals(symbol: string, price: number, beta: number): FundamentalAnalysis | null {
  const f = FUNDAMENTALS[symbol.toUpperCase()];
  if (!f || price <= 0) {
    return null;
  }
  const peg = f.epsGrowthPct > 0 ? f.pe / f.epsGrowthPct : null;
  const discountRate = costOfEquity(beta);
  const growth = clamp(f.fcfGrowthPct / 100, -0.05, 0.25);
  const intrinsicValue = price * (f.fcfYieldPct / 100) * dcfMultiple(growth, discountRate);
  const marginOfSafety = intrinsicValue > 0 ? (intrinsicValue - price) / intrinsicValue : -1;
  const altmanZone = f.altmanZ > 3 ? 'safe' : f.altmanZ >= 1.8 ? 'grey' : 'distress';

  // Each part scored 0-100, then weighted.
  const pegScore = peg === null ? 0 : peg <= 1 ? 100 : peg >= 3 ? 0 : 100 * (1 - (peg - 1) / 2);
  const mosScore = clamp(((marginOfSafety + 0.5) / 0.7) * 100, 0, 100); // -50% -> 0, +20% -> 100
  const roeScore = clamp((f.roePct / 25) * 100, 0, 100);
  const leverageScore = f.debtToEquity <= 0.5 ? 100 : f.debtToEquity >= 2 ? 0 : 100 * (1 - (f.debtToEquity - 0.5) / 1.5);
  const piotroskiScore = (f.piotroski / 9) * 100;
  const altmanScore = altmanZone === 'safe' ? 100 : altmanZone === 'grey' ? 50 : 0;
  const score =
    0.25 * pegScore + 0.2 * mosScore + 0.15 * roeScore + 0.1 * leverageScore + 0.2 * piotroskiScore + 0.1 * altmanScore;

  const notes: string[] = [];
  if (peg !== null) {
    notes.push(
      peg <= 1
        ? `PEG ${peg.toFixed(2)}: growth more than pays for the P/E of ${f.pe}.`
        : peg <= 2
          ? `PEG ${peg.toFixed(2)}: fairly priced for its growth.`
          : `PEG ${peg.toFixed(2)}: expensive for its expected growth.`
    );
  } else {
    notes.push('Earnings are not expected to grow; P/E cannot be justified by growth.');
  }
  notes.push(
    marginOfSafety >= 0
      ? `DCF value ${intrinsicValue.toFixed(2)} is ${(marginOfSafety * 100).toFixed(0)}% above the price.`
      : `Price is ${((price / intrinsicValue - 1) * 100).toFixed(0)}% above the DCF value of ${intrinsicValue.toFixed(2)} (r = ${(discountRate * 100).toFixed(1)}%).`
  );
  notes.push(`Piotroski ${f.piotroski}/9, Altman Z ${f.altmanZ} (${altmanZone}).`);
  if (f.debtToEquity > 1) {
    notes.push(`Debt/equity of ${f.debtToEquity} is high.`);
  }

  return { fundamentals: f, peg, discountRate, intrinsicValue, marginOfSafety, altmanZone, score: Math.round(score), notes };
}
