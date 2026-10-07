import { Candle } from '../../shared/models/candle.models';
import {
  Bollinger,
  Macd,
  SimulationResult,
  TRADING_DAYS,
  annualisedVolatility,
  atr,
  beta as betaOf,
  bollinger,
  clamp,
  correlation,
  covariance,
  herfindahl,
  historicalVaR,
  maxDrawdown,
  maxSharpePortfolio,
  mean,
  medianPrice,
  momentum,
  macd,
  obvSlope,
  probabilityAbove,
  requiredGainToRecover,
  rsi,
  sharpeRatio,
  simpleReturns,
  simulatePortfolio,
  sma,
  sortinoRatio,
  supportResistance
} from './advisor-math';
import { EQUITY_RISK_PREMIUM, FundamentalAnalysis, RISK_FREE_RATE, analyseFundamentals } from './fundamentals';

/**
 * The portfolio advisor: analyses each holding three ways and recommends what
 * to do with it over the next three months.
 *
 *  1. Technical: trend (SMA 50/200), momentum (RSI, MACD, 3-month change),
 *     volatility (Bollinger %B, ATR), volume (OBV) and support/resistance,
 *     from the saved daily candles.
 *  2. Fundamental: PEG, a two-stage DCF with a CAPM discount rate, ROE,
 *     leverage, Piotroski and Altman scores (see fundamentals.ts).
 *  3. Strategic: volatility, Sharpe, Sortino, beta, drawdown, correlation,
 *     concentration (HHI), Value at Risk, a correlated Monte Carlo of the
 *     next three months, and a long-only maximum-Sharpe rebalance.
 *
 * Composite score = 0.40 fundamental + 0.35 technical + 0.25 risk, each 0-100.
 *
 * Expected returns blend history with CAPM so one good year is not projected
 * forward unchanged: mu = 0.5 historical + 0.5 (rf + beta x ERP), tilted by
 * up to +/-4% a year by the composite score, and held within -30% to +40%.
 *
 * The rebalance moves half-way from the current weights to the maximum-
 * Sharpe portfolio (exits go to zero): a full jump to an optimiser's corner
 * solution over-trusts a year of data and would sell positions the per-stock
 * advice says to hold.
 *
 * Nothing here can promise a profit. Every figure is a model estimate from a
 * year of prices and a static fundamentals snapshot; the screen says so.
 */

export const HORIZON_DAYS = 63; // three months of trading days
export const MAX_WEIGHT = 0.35;
const SIMULATION_PATHS = 4000;
const SIMULATION_SEED = 20261007;

export type AdvisorAction = 'BUY_MORE' | 'AVERAGE_DOWN' | 'HOLD' | 'TRIM' | 'TAKE_PROFIT' | 'EXIT';
export type Confidence = 'low' | 'medium' | 'high';

export interface AdvisorHolding {
  symbol: string;
  quantity: number;
  averageCost: number;
  /** The latest quote; null falls back to the last saved close. */
  lastPrice: number | null;
}

export interface AdvisorInput {
  holdings: AdvisorHolding[];
  cash: number;
  candlesBySymbol: Record<string, Candle[]>;
  /** Minimum return wanted over the horizon, as a fraction (0.05 = 5%). */
  targetReturn: number;
}

export interface TechnicalAnalysis {
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: Macd | null;
  bollinger: Bollinger | null;
  atr14: number | null;
  support: number | null;
  resistance: number | null;
  obvSlope: number | null;
  momentum3m: number | null;
  trend: 'up' | 'down' | 'sideways';
  score: number;
  notes: string[];
}

export interface RiskAnalysis {
  volatility: number;
  beta: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  /** One-day 95% historical VaR, as a positive fraction. */
  var95: number;
  score: number;
}

export interface StockAnalysis {
  symbol: string;
  price: number;
  priceSource: 'quote' | 'close';
  technical: TechnicalAnalysis;
  fundamental: FundamentalAnalysis | null;
  risk: RiskAnalysis;
  compositeScore: number;
  /** Annual expected return used by the forecasts. */
  expectedReturn: number;
  /** Median price in three months under the lognormal model. */
  medianPrice3m: number;
  /** Probability the price is higher in three months. */
  probabilityUp3m: number;
}

export interface HoldingAdvice {
  symbol: string;
  quantity: number;
  averageCost: number;
  price: number;
  marketValue: number;
  costBasis: number;
  unrealisedPnl: number;
  unrealisedPct: number;
  /** Share of the invested value (holdings only, not cash). */
  weight: number;
  status: 'profit' | 'loss' | 'flat';
  action: AdvisorAction;
  /** Shares to buy (positive) or sell (negative); 0 to hold. */
  quantityChange: number;
  confidence: Confidence;
  stopLoss: number;
  targetPrice: number;
  /** Gain from today's price needed to get back to average cost; 0 when in profit. */
  breakEvenGain: number;
  /** The price the probability below refers to: average cost when at a loss, cost + target otherwise. */
  goalPrice: number;
  /** Probability of being at or above goalPrice in three months. */
  goalProbability: number;
  reasons: string[];
  analysis: StockAnalysis;
}

export interface RebalanceTrade {
  symbol: string;
  currentWeight: number;
  targetWeight: number;
  /** Shares to buy (positive) or sell (negative). */
  quantity: number;
  value: number;
}

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  beta: number;
  var95Daily: number;
  maxDrawdown: number;
  hhi: number;
  effectiveHoldings: number;
}

export interface AdvisorReport {
  targetReturn: number;
  horizonDays: number;
  cash: number;
  investedValue: number;
  costBasis: number;
  unrealisedPnl: number;
  unrealisedPct: number;
  status: 'profit' | 'loss' | 'flat' | 'empty';
  /**
   * The return the headline probability is for: break-even when at a loss,
   * otherwise the target. Forecasts' probabilities are [goalReturn, targetReturn].
   */
  goalReturn: number;
  metrics: PortfolioMetrics | null;
  currentForecast: SimulationResult | null;
  optimisedForecast: SimulationResult | null;
  optimisedWeights: Record<string, number>;
  rebalance: RebalanceTrade[];
  correlation: { symbols: string[]; matrix: number[][] };
  holdings: HoldingAdvice[];
  /** Instruments not held that score well. */
  ideas: StockAnalysis[];
  /** Held symbols with no saved candles. */
  unanalysed: string[];
  summary: string[];
}

export function buildAdvisorReport(input: AdvisorInput): AdvisorReport {
  const years = HORIZON_DAYS / TRADING_DAYS;
  const symbols = Object.keys(input.candlesBySymbol)
    .filter((s) => (input.candlesBySymbol[s]?.length ?? 0) > 30)
    .sort();
  const aligned = alignReturns(symbols, input.candlesBySymbol);
  const market = aligned.dates.map((_, d) => mean(symbols.map((s) => aligned.returns[s][d])));

  const quoted = new Map(input.holdings.map((h) => [h.symbol.toUpperCase(), h.lastPrice]));
  const analyses = new Map<string, StockAnalysis>();
  for (const symbol of symbols) {
    analyses.set(symbol, analyseStock(symbol, input.candlesBySymbol[symbol], aligned.returns[symbol], market, quoted.get(symbol) ?? null, years));
  }

  const held = input.holdings
    .filter((h) => h.quantity > 0)
    .map((h) => ({ ...h, symbol: h.symbol.toUpperCase() }));
  const analysable = held.filter((h) => analyses.has(h.symbol));
  const unanalysed = held.filter((h) => !analyses.has(h.symbol)).map((h) => h.symbol);

  const valueOf = (h: AdvisorHolding) => h.quantity * (analyses.get(h.symbol) as StockAnalysis).price;
  const investedValue = analysable.reduce((s, h) => s + valueOf(h), 0);
  const costBasis = analysable.reduce((s, h) => s + h.quantity * h.averageCost, 0);
  const unrealisedPnl = investedValue - costBasis;
  const unrealisedPct = costBasis === 0 ? 0 : unrealisedPnl / costBasis;
  const status: AdvisorReport['status'] =
    analysable.length === 0 ? 'empty' : unrealisedPct < -0.005 ? 'loss' : unrealisedPct > 0.005 ? 'profit' : 'flat';
  const goalReturn = status === 'loss' ? requiredGainToRecover(-unrealisedPct) : input.targetReturn;

  // Ideas: not held, decent score, best first. The top one is where an exit is redeployed.
  const heldSymbols = new Set(analysable.map((h) => h.symbol));
  const ideas = [...analyses.values()]
    .filter((a) => !heldSymbols.has(a.symbol) && a.compositeScore >= 55)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const holdings = analysable
    .map((h) =>
      adviseHolding(h, analyses.get(h.symbol) as StockAnalysis, investedValue, input.cash, input.targetReturn, years, ideas[0]?.symbol)
    )
    .sort((a, b) => b.marketValue - a.marketValue);

  // Strategic layer: covariance, current portfolio, optimised portfolio.
  const annualCov = (a: string, b: string) => covariance(aligned.returns[a], aligned.returns[b]) * TRADING_DAYS;
  const heldList = holdings.map((h) => h.symbol);
  const correlationMatrix = heldList.map((a) => heldList.map((b) => correlation(aligned.returns[a], aligned.returns[b])));

  let metrics: PortfolioMetrics | null = null;
  let currentForecast: SimulationResult | null = null;
  if (heldList.length > 0) {
    const weights = holdings.map((h) => h.weight);
    const daily = aligned.dates.map((_, d) => heldList.reduce((s, sym, i) => s + weights[i] * aligned.returns[sym][d], 0));
    const growth = daily.reduce<number[]>((acc, r) => [...acc, (acc.at(-1) ?? 1) * (1 + r)], [1]);
    metrics = {
      expectedReturn: holdings.reduce((s, h) => s + h.weight * h.analysis.expectedReturn, 0),
      volatility: annualisedVolatility(daily),
      sharpe: sharpeRatio(daily, RISK_FREE_RATE),
      sortino: sortinoRatio(daily, RISK_FREE_RATE),
      beta: betaOf(daily, market),
      var95Daily: historicalVaR(daily),
      maxDrawdown: maxDrawdown(growth),
      hhi: herfindahl(weights),
      effectiveHoldings: 1 / herfindahl(weights)
    };
    currentForecast = simulate(heldList, weights, analyses, aligned.returns, years, [goalReturn, input.targetReturn]);
  }

  // Optimise over every analysable instrument except those the advisor says to exit.
  const exits = new Set(holdings.filter((h) => h.action === 'EXIT' || h.action === 'TAKE_PROFIT').map((h) => h.symbol));
  const universe = symbols.filter((s) => !exits.has(s) && (heldSymbols.has(s) || (analyses.get(s) as StockAnalysis).compositeScore >= 55));
  const base = investedValue > 0 ? investedValue : input.cash;
  const optimisedWeights: Record<string, number> = {};
  let optimisedForecast: SimulationResult | null = null;
  const rebalance: RebalanceTrade[] = [];
  if (universe.length > 0 && base > 0) {
    const optimum = maxSharpePortfolio({
      expectedReturns: universe.map((s) => (analyses.get(s) as StockAnalysis).expectedReturn),
      covariance: universe.map((a) => universe.map((b) => annualCov(a, b))),
      riskFree: RISK_FREE_RATE,
      maxWeight: MAX_WEIGHT,
      candidates: 6000,
      seed: SIMULATION_SEED
    });
    // Half-way from today's weights to the optimum; exits to zero.
    const all = [...new Set([...universe, ...heldList])].sort();
    const currentWeight = (s: string) => holdings.find((h) => h.symbol === s)?.weight ?? 0;
    const optimal = (s: string) => optimum.weights[universe.indexOf(s)] ?? 0;
    const raw = all.map((s) => (exits.has(s) ? 0 : investedValue > 0 ? 0.5 * currentWeight(s) + 0.5 * optimal(s) : optimal(s)));
    const rawTotal = raw.reduce((t, w) => t + w, 0) || 1;
    all.forEach((s, i) => {
      if (raw[i] > 0.001) {
        optimisedWeights[s] = raw[i] / rawTotal;
      }
    });
    const targetSymbols = Object.keys(optimisedWeights);
    optimisedForecast = simulate(
      targetSymbols,
      targetSymbols.map((s) => optimisedWeights[s]),
      analyses,
      aligned.returns,
      years,
      [goalReturn, input.targetReturn]
    );

    for (const symbol of all) {
      const analysis = analyses.get(symbol) as StockAnalysis;
      const holding = holdings.find((h) => h.symbol === symbol);
      const currentValue = holding?.marketValue ?? 0;
      const targetWeight = optimisedWeights[symbol] ?? 0;
      const quantity = Math.round((targetWeight * base - currentValue) / analysis.price);
      const value = quantity * analysis.price;
      if (quantity !== 0 && Math.abs(value) >= 0.01 * base) {
        rebalance.push({ symbol, currentWeight: holding?.weight ?? 0, targetWeight, quantity, value: round2(value) });
      }
    }
    rebalance.sort((a, b) => a.value - b.value); // sells first, they fund the buys
  }

  const report: AdvisorReport = {
    targetReturn: input.targetReturn,
    horizonDays: HORIZON_DAYS,
    cash: input.cash,
    investedValue: round2(investedValue),
    costBasis: round2(costBasis),
    unrealisedPnl: round2(unrealisedPnl),
    unrealisedPct,
    status,
    goalReturn,
    metrics,
    currentForecast,
    optimisedForecast,
    optimisedWeights,
    rebalance,
    correlation: { symbols: heldList, matrix: correlationMatrix },
    holdings,
    ideas,
    unanalysed,
    summary: []
  };
  report.summary = summarise(report);
  return report;
}

// ---------------------------------------------------------------------------
// Per instrument
// ---------------------------------------------------------------------------

function analyseStock(
  symbol: string,
  candles: Candle[],
  alignedReturns: number[],
  market: number[],
  quote: number | null,
  years: number
): StockAnalysis {
  const closes = candles.map((c) => c.close);
  const price = quote !== null && quote > 0 ? quote : closes[closes.length - 1];
  const technical = analyseTechnicals(candles, price);
  const ownReturns = simpleReturns(closes);
  const stockBeta = betaOf(alignedReturns, market);
  const risk = analyseRisk(ownReturns, closes, stockBeta);
  const fundamental = analyseFundamentals(symbol, price, stockBeta);

  // Without fundamentals the composite re-weights the other two.
  const compositeScore = Math.round(
    fundamental
      ? 0.4 * fundamental.score + 0.35 * technical.score + 0.25 * risk.score
      : (0.35 * technical.score + 0.25 * risk.score) / 0.6
  );
  const historical = mean(ownReturns) * TRADING_DAYS;
  const capm = RISK_FREE_RATE + stockBeta * EQUITY_RISK_PREMIUM;
  const tilt = ((compositeScore - 50) / 50) * 0.04;
  const expectedReturn = clamp(0.5 * historical + 0.5 * capm + tilt, -0.3, 0.4);

  return {
    symbol,
    price,
    priceSource: quote !== null && quote > 0 ? 'quote' : 'close',
    technical,
    fundamental,
    risk,
    compositeScore,
    expectedReturn,
    medianPrice3m: medianPrice(price, expectedReturn, risk.volatility, years),
    probabilityUp3m: probabilityAbove(price, price, expectedReturn, risk.volatility, years)
  };
}

export function analyseTechnicals(candles: Candle[], price: number): TechnicalAnalysis {
  const closes = candles.map((c) => c.close);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const macdValue = macd(closes);
  const bands = bollinger(closes);
  const atr14 = atr(candles, 14);
  const levels = supportResistance(candles, 60);
  const obv = obvSlope(candles, 20);
  const momentum3m = momentum(closes, HORIZON_DAYS);

  let points = 0;
  const notes: string[] = [];
  if (sma50 !== null) {
    if (price > sma50) {
      points += 15;
      notes.push('Price is above its 50-day average.');
    } else {
      notes.push('Price is below its 50-day average.');
    }
  }
  if (sma50 !== null && sma200 !== null) {
    if (sma50 > sma200) {
      points += 15;
      notes.push('50-day average is above the 200-day (golden-cross regime).');
    } else {
      notes.push('50-day average is below the 200-day (death-cross regime).');
    }
  }
  if (macdValue) {
    if (macdValue.histogram > 0) {
      points += 15;
      notes.push('MACD is above its signal line: momentum is building.');
    } else {
      notes.push('MACD is below its signal line: momentum is fading.');
    }
  }
  if (rsi14 !== null) {
    if (rsi14 >= 70) {
      points += 3;
      notes.push(`RSI ${rsi14.toFixed(0)}: overbought, a pullback is more likely.`);
    } else if (rsi14 >= 60) {
      points += 15;
      notes.push(`RSI ${rsi14.toFixed(0)}: strong without being stretched.`);
    } else if (rsi14 >= 40) {
      points += 10;
      notes.push(`RSI ${rsi14.toFixed(0)}: neutral.`);
    } else if (rsi14 >= 30) {
      points += 7;
      notes.push(`RSI ${rsi14.toFixed(0)}: weak.`);
    } else {
      points += 10;
      notes.push(`RSI ${rsi14.toFixed(0)}: oversold, a rebound is possible.`);
    }
  }
  if (bands) {
    points += bands.percentB > 1 ? 3 : bands.percentB < 0 ? 7 : bands.percentB > 0.8 ? 6 : 10;
    if (bands.percentB > 1) {
      notes.push('Price is above the upper Bollinger band.');
    } else if (bands.percentB < 0) {
      notes.push('Price is below the lower Bollinger band.');
    }
  }
  if (obv !== null && obv > 0) {
    points += 10;
    notes.push('On-balance volume is rising: buyers are in control.');
  }
  if (momentum3m !== null && momentum3m > 0) {
    points += 10;
  }

  const trend = sma50 === null || sma200 === null ? 'sideways' : price > sma50 && sma50 > sma200 ? 'up' : price < sma50 && sma50 < sma200 ? 'down' : 'sideways';
  return {
    sma50,
    sma200,
    rsi14,
    macd: macdValue,
    bollinger: bands,
    atr14,
    support: levels?.support ?? null,
    resistance: levels?.resistance ?? null,
    obvSlope: obv,
    momentum3m,
    trend,
    score: Math.round((points / 90) * 100),
    notes
  };
}

function analyseRisk(returns: number[], closes: number[], stockBeta: number): RiskAnalysis {
  const volatility = annualisedVolatility(returns);
  const sharpe = sharpeRatio(returns, RISK_FREE_RATE);
  const drawdown = maxDrawdown(closes);
  const volScore = clamp(((0.6 - volatility) / 0.4) * 100, 0, 100); // 20% -> 100, 60% -> 0
  const ddScore = clamp(((0.5 - drawdown) / 0.4) * 100, 0, 100); // 10% -> 100, 50% -> 0
  const sharpeScore = clamp(((sharpe + 0.5) / 2) * 100, 0, 100); // -0.5 -> 0, 1.5 -> 100
  return {
    volatility,
    beta: stockBeta,
    sharpe,
    sortino: sortinoRatio(returns, RISK_FREE_RATE),
    maxDrawdown: drawdown,
    var95: historicalVaR(returns),
    score: Math.round((volScore + ddScore + sharpeScore) / 3)
  };
}

function adviseHolding(
  holding: AdvisorHolding,
  analysis: StockAnalysis,
  investedValue: number,
  cash: number,
  targetReturn: number,
  years: number,
  switchTo: string | undefined
): HoldingAdvice {
  const { price, technical: t, compositeScore: score } = analysis;
  const sigma = analysis.risk.volatility;
  const marketValue = holding.quantity * price;
  const costBasis = holding.quantity * holding.averageCost;
  const unrealisedPnl = marketValue - costBasis;
  const unrealisedPct = costBasis === 0 ? 0 : unrealisedPnl / costBasis;
  const weight = investedValue === 0 ? 0 : marketValue / investedValue;
  const status = unrealisedPct < -0.005 ? 'loss' : unrealisedPct > 0.005 ? 'profit' : 'flat';
  const atr14 = t.atr14 ?? price * 0.03;
  const rsi14 = t.rsi14 ?? 50;
  const percentB = t.bollinger?.percentB ?? 0.5;
  const nearSupport = t.support !== null && price <= t.support * 1.05;
  const reasons: string[] = [`Composite score ${score}/100 (fundamental ${analysis.fundamental?.score ?? 'n/a'}, technical ${t.score}, risk ${analysis.risk.score}).`];

  // How many shares can be added without breaching the weight cap or using more than half the cash.
  const maxAdd = Math.max(
    0,
    Math.floor(Math.min((MAX_WEIGHT * investedValue - marketValue) / ((1 - MAX_WEIGHT) * price), (0.5 * cash) / price, holding.quantity))
  );

  let action: AdvisorAction = 'HOLD';
  let quantityChange = 0;
  let stopLoss = price - 2 * atr14;
  const breakEvenGain = status === 'loss' ? requiredGainToRecover(-unrealisedPct) : 0;

  if (status === 'loss') {
    reasons.push(
      `Down ${(-unrealisedPct * 100).toFixed(1)}%: it needs +${(breakEvenGain * 100).toFixed(1)}% from here to break even, since a fall of L needs a gain of L / (1 - L).`
    );
    if (score < 40) {
      action = 'EXIT';
      quantityChange = -holding.quantity;
      reasons.push('Weak on the combined analysis: the money is more likely to recover elsewhere than here.');
      if (switchTo) {
        reasons.push(`Consider moving the proceeds to ${switchTo}, the best-scoring instrument you do not hold.`);
      }
    } else if (score >= 60 && (rsi14 < 40 || percentB < 0.2 || nearSupport) && maxAdd >= 1) {
      action = 'AVERAGE_DOWN';
      quantityChange = maxAdd;
      const newAverage = (costBasis + maxAdd * price) / (holding.quantity + maxAdd);
      const newGain = newAverage / price - 1;
      reasons.push(
        `Sound business at a temporarily weak price (RSI ${rsi14.toFixed(0)}${nearSupport ? ', near support' : ''}). Buying ${maxAdd} more lowers the average cost to ${newAverage.toFixed(2)}, so break-even needs +${(newGain * 100).toFixed(1)}% instead of +${(breakEvenGain * 100).toFixed(1)}%.`
      );
      reasons.push('Only average down with money you can leave invested; the stop-loss still applies.');
    } else {
      reasons.push(
        score >= 60
          ? 'Fundamentally sound; wait for the price to stabilise before adding.'
          : 'Mixed signals: hold, but keep the stop-loss in place and review if it is hit.'
      );
    }
  } else {
    const minProfitPrice = holding.averageCost * (1 + targetReturn);
    // Trailing stop: lock in the minimum profit when the price allows, otherwise protect break-even.
    const floor = price > minProfitPrice ? minProfitPrice : holding.averageCost;
    if (status === 'profit' && floor < price) {
      stopLoss = Math.max(stopLoss, floor);
    }
    if (status === 'profit') {
      reasons.push(`Up ${(unrealisedPct * 100).toFixed(1)}% on cost.`);
    }
    if (score < 40) {
      action = 'TAKE_PROFIT';
      quantityChange = -holding.quantity;
      reasons.push('The analysis has turned weak: book the gain rather than risk giving it back.');
    } else if (weight > MAX_WEIGHT || (status === 'profit' && (rsi14 >= 70 || percentB > 1))) {
      action = 'TRIM';
      const overweight = weight > MAX_WEIGHT ? Math.ceil(((weight - MAX_WEIGHT) * investedValue) / price) : 0;
      quantityChange = -Math.max(1, Math.min(holding.quantity, Math.max(overweight, Math.floor(holding.quantity / 3))));
      if (weight > MAX_WEIGHT) {
        reasons.push(`It is ${(weight * 100).toFixed(0)}% of your holdings, above the ${MAX_WEIGHT * 100}% cap: too much rides on one stock.`);
      }
      if (rsi14 >= 70 || percentB > 1) {
        reasons.push('Overbought on RSI or Bollinger: sell part to lock in profit and keep the rest for the trend.');
      }
      reasons.push(`Selling ${-quantityChange} books about ${(-quantityChange * (price - holding.averageCost)).toFixed(2)} of profit.`);
    } else if (score >= 70 && t.trend === 'up' && rsi14 < 65 && weight < 0.2 && maxAdd >= 1) {
      action = 'BUY_MORE';
      quantityChange = maxAdd;
      reasons.push('Strong on all three analyses and in an uptrend without being overbought: room to add.');
    } else {
      reasons.push('No reason to change the position: hold and let the trailing stop protect the gain.');
    }
    if (stopLoss >= minProfitPrice && status === 'profit') {
      reasons.push(`A stop at ${stopLoss.toFixed(2)} locks in at least ${(targetReturn * 100).toFixed(0)}% profit.`);
    }
  }

  const goalPrice = status === 'loss' ? holding.averageCost : holding.averageCost * (1 + targetReturn);
  const goalProbability = probabilityAbove(price, goalPrice, analysis.expectedReturn, sigma, years);
  reasons.push(
    status === 'loss'
      ? `Chance of being back at the average cost of ${holding.averageCost.toFixed(2)} in three months: ${chance(goalProbability)}.`
      : `Chance of being at least ${(targetReturn * 100).toFixed(0)}% above cost (${goalPrice.toFixed(2)}) in three months: ${chance(goalProbability)}.`
  );
  const agreement =
    analysis.fundamental === null ? false : analysis.fundamental.score >= 50 === analysis.technical.score >= 50;
  const conviction = Math.abs(score - 50);
  const confidence: Confidence = conviction >= 20 && agreement ? 'high' : conviction >= 10 ? 'medium' : 'low';

  return {
    symbol: holding.symbol,
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    price,
    marketValue: round2(marketValue),
    costBasis: round2(costBasis),
    unrealisedPnl: round2(unrealisedPnl),
    unrealisedPct,
    weight,
    status,
    action,
    quantityChange,
    confidence,
    stopLoss: round2(Math.max(stopLoss, 0)),
    targetPrice: round2(Math.max(analysis.medianPrice3m, 0)),
    breakEvenGain,
    goalPrice: round2(goalPrice),
    goalProbability,
    reasons,
    analysis
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Daily returns of each symbol on the dates every symbol traded, so they can be compared. */
function alignReturns(symbols: string[], candlesBySymbol: Record<string, Candle[]>): { dates: string[]; returns: Record<string, number[]> } {
  const closeMaps = symbols.map((s) => new Map(candlesBySymbol[s].map((c) => [c.date, c.close])));
  const dates = [...(closeMaps[0]?.keys() ?? [])].filter((d) => closeMaps.every((m) => m.has(d))).sort();
  const returns: Record<string, number[]> = {};
  symbols.forEach((s, i) => {
    const closes = dates.map((d) => closeMaps[i].get(d) as number);
    returns[s] = simpleReturns(closes);
  });
  return { dates: dates.slice(1), returns };
}

function simulate(
  symbols: string[],
  weights: number[],
  analyses: Map<string, StockAnalysis>,
  returns: Record<string, number[]>,
  years: number,
  targets: number[]
): SimulationResult {
  return simulatePortfolio({
    weights,
    mu: symbols.map((s) => (analyses.get(s) as StockAnalysis).expectedReturn),
    sigma: symbols.map((s) => (analyses.get(s) as StockAnalysis).risk.volatility),
    correlation: symbols.map((a) => symbols.map((b) => (a === b ? 1 : correlation(returns[a], returns[b])))),
    years,
    paths: SIMULATION_PATHS,
    seed: SIMULATION_SEED,
    targets
  });
}

function summarise(report: AdvisorReport): string[] {
  const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
  const lines: string[] = [];
  if (report.status === 'empty') {
    lines.push('You have no holdings the advisor can analyse yet. The ideas below are the best-scoring instruments.');
    return lines;
  }
  const current = report.currentForecast as SimulationResult;
  const optimised = report.optimisedForecast;
  const target = pct(report.targetReturn, 0);
  if (report.status === 'loss') {
    lines.push(
      `Your holdings are down ${pct(-report.unrealisedPct)} and need +${pct(report.goalReturn)} to break even. ` +
        `The model puts the chance of that within three months at ${chance(current.probabilities[0])}` +
        (current.probabilities[0] < 0.2 ? ': a full recovery will most likely take longer, so aim to recover steadily rather than all at once.' : '.')
    );
    lines.push(
      `Chance of gaining at least ${target} from today's value in three months: ${chance(current.probabilities[1])} as held` +
        (optimised ? `, ${chance(optimised.probabilities[1])} after the suggested rebalance.` : '.')
    );
  } else {
    lines.push(
      `Your holdings are ${report.status === 'profit' ? `up ${pct(report.unrealisedPct)}` : 'flat'}. ` +
        `Chance of making at least ${target} more in the next three months: ${chance(current.probabilities[1])} as held` +
        (optimised ? `, ${chance(optimised.probabilities[1])} after the suggested rebalance.` : '.')
    );
  }
  lines.push(
    `Three-month range (5th to 95th percentile): ${pct(current.p5)} to ${pct(current.p95)}; median ${pct(current.median)}. ` +
      `In the worst 5% of outcomes you would lose ${pct(current.expectedShortfall95)} on average` +
      (optimised ? ` (${pct(optimised.expectedShortfall95)} after the rebalance).` : '.')
  );
  const actions = report.holdings.filter((h) => h.action !== 'HOLD');
  if (actions.length > 0) {
    lines.push(`Suggested actions: ${actions.map((h) => `${label(h.action).toLowerCase()} ${h.symbol}`).join(', ')}.`);
  } else {
    lines.push('No holding needs action now; keep the stop-losses below in place.');
  }
  if (report.metrics && report.metrics.effectiveHoldings < 3) {
    lines.push(
      `Concentration is high: your holdings behave like ${report.metrics.effectiveHoldings.toFixed(1)} equal positions. Spreading out lowers risk more than it lowers return.`
    );
  }
  return lines;
}

/** A probability for people: "under 1%" and "over 99%" rather than a falsely certain 0% or 100%. */
export function chance(probability: number): string {
  if (probability < 0.01) {
    return 'under 1%';
  }
  if (probability > 0.99) {
    return 'over 99%';
  }
  return `${Math.round(probability * 100)}%`;
}

export function label(action: AdvisorAction): string {
  switch (action) {
    case 'BUY_MORE':
      return 'Buy more';
    case 'AVERAGE_DOWN':
      return 'Average down';
    case 'TRIM':
      return 'Trim';
    case 'TAKE_PROFIT':
      return 'Take profit';
    case 'EXIT':
      return 'Exit';
    default:
      return 'Hold';
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
