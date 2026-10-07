# Portfolio advisor

A customer can see what they hold and whether they are up or down. They cannot see *why*, or what
to do about it. The advisor analyses each holding three ways (technical, fundamental and
strategic) and turns that into one recommendation per holding, plus a rebalance of the whole
portfolio, over a fixed horizon of three months (63 trading days).

Its goal depends on where the customer stands:

- **At a loss:** recover. The advisor shows how far the holdings need to rise to break even, the
  model's chance of getting there in three months, and which positions to exit, hold or average
  down.
- **In profit:** keep it and add to it. The customer sets a minimum return for the next three
  months (5% by default). The advisor shows the chance of reaching it, trims what is overbought
  or oversized, and sets trailing stops that lock that minimum in.

No model can guarantee a profit. The screen says so, every probability is labelled as the model's,
and "0%" or "100%" are never shown (they read "under 1%" or "over 99%").

## Where it sits

| | |
|---|---|
| Route | `/advisor` (customer, behind `kycApprovalGuard`), in the sidebar after Portfolio |
| Code | `Frontend/frontend-app/src/app/features/advisor/` |
| Reads | `GET /api/v1/portfolio/{accountId}/positions` (falls back to `GET /accounts/me/positions` on MKT-503), `GET /accounts/me/balance`, `public/candles/*.json` |
| Writes | Nothing. It recommends; the customer places any order themselves |

It runs in the browser, like the value-over-time chart in `portfolio-history.ts`. The price history
it needs lives only in the saved candles, the contract leaves history out of scope, and the
analysis is a pure function of positions plus candles. Keeping it in the browser needs no new
service, no contract change and no quota, and lets the target return be changed without a reload.
If it moves server-side later, `portfolio-advisor.ts` ports one-for-one to a Java service behind a
`GET /api/v1/portfolio/{accountId}/advice` route.

| File | What it does |
|---|---|
| `advisor-math.ts` | Indicators, statistics, GBM, Monte Carlo, Cholesky, max-Sharpe search. Pure and seeded |
| `fundamentals.ts` | Fundamentals snapshot, CAPM, two-stage DCF, fundamental score |
| `portfolio-advisor.ts` | Per-stock analysis, decision rules, portfolio metrics, rebalance, summary |
| `advisor.component.ts` | The screen |

## 1. Technical analysis (daily candles)

| Indicator | Formula / setting | Reading |
|---|---|---|
| SMA 50 / 200 | Arithmetic mean of closes | Price > SMA50 and SMA50 > SMA200 is an uptrend (golden-cross regime) |
| RSI 14 | Wilder: RS = avg gain / avg loss, RSI = 100 − 100/(1+RS) | > 70 overbought, < 30 oversold |
| MACD 12/26/9 | EMA12 − EMA26; signal = EMA9 of MACD | Histogram > 0 means momentum is building |
| Bollinger 20, 2σ | SMA20 ± 2σ; %B = (P − lower)/(upper − lower) | %B > 1 is stretched, < 0 is washed out |
| ATR 14 | Wilder average of max(H−L, \|H−Cₜ₋₁\|, \|L−Cₜ₋₁\|) | Sets the stop-loss distance |
| Support / resistance | 60-day lowest low / highest high | "Near support" means within 5% |
| OBV slope | Least-squares slope of on-balance volume, 20 days | > 0 means buyers are in control |
| Momentum | 63-day % change | |

The score (0–100) is the sum of points awarded to each signal, scaled to 100.

## 2. Fundamental analysis

The platform has no fundamentals feed, so `FUNDAMENTALS` is a **static, approximate snapshot** for
the eight instruments with saved candles. Cash flow is held as a **yield** (FCF / market cap), so
the snapshot survives stock splits and any price level. A real feed is the first follow-up (see
below).

- **PEG** = P/E ÷ EPS growth: ≤ 1 cheap, ≥ 3 expensive.
- **Discount rate (CAPM)**: r = rf + β × ERP, with rf = 4.25%, ERP = 5%, β measured against
  the equal-weight basket of all eight, held within 7–14%.
- **Two-stage DCF**: FCF grows at g₁ for years 1–5 and fades linearly to gₜ = 3% by year 10.
  V = Σ FCFₜ/(1+r)ᵗ + TV/(1+r)¹⁰, with TV = FCF₁₀(1+gₜ)/(r−gₜ).
  **Margin of safety** = (V − P)/V.
- **Quality**: ROE, debt/equity, **Piotroski F-Score** (0–9), **Altman Z-Score** (> 3 safe,
  1.8–3 grey, < 1.8 distress).

Score = 25% PEG + 20% margin of safety + 15% ROE + 10% leverage + 20% Piotroski + 10% Altman.

## 3. Strategic (portfolio) analysis

| Measure | Formula |
|---|---|
| Volatility | σ_daily × √252 |
| Sharpe / Sortino | (R − rf)/σ, and the same over downside deviation only |
| Beta | Cov(r, m) / Var(m) against the equal-weight basket |
| Max drawdown | Largest peak-to-trough fall |
| Value at Risk | Historical 95% (1 day), and simulated 95% plus expected shortfall (3 months) |
| Concentration | HHI = Σwᵢ²; effective holdings = 1/HHI |
| Correlation | Pearson correlation of daily returns, shown as a matrix |

**Expected return.** μ = ½ × historical + ½ × CAPM, tilted by up to ±4% a year by the composite
score, and held within −30% to +40%. Blending stops one exceptional year from being projected
forward unchanged.

**Forecast.** Correlated Monte Carlo: 4,000 paths of geometric Brownian motion, with shocks
correlated through the Cholesky factor of the correlation matrix and a fixed seed, so the same
portfolio always gets the same advice. Per holding, the closed form P(Sₜ ≥ K) = N(d₂), with
d₂ = (ln(S/K) + (μ − σ²/2)T)/(σ√T).

**Rebalance.** A long-only maximum-Sharpe portfolio found by sampling 6,000 weight vectors on the
simplex, each weight capped at 35%. The suggestion moves **half-way** from today's weights to that
optimum, and exits go to zero. A full jump to an optimiser's corner solution over-trusts a year of
data, and it would sell positions the per-holding advice says to keep. Sells are listed first,
because they fund the buys.

## 4. Decision rules

Composite = 40% fundamental + 35% technical + 25% risk.

| Position | Condition | Action |
|---|---|---|
| At a loss | Composite < 40 | **Exit**, and redeploy into the best-scoring instrument not held |
| At a loss | Composite ≥ 60 and (RSI < 40, %B < 0.2 or near support) | **Average down**, within a 35% weight cap, at most half the cash, and at most doubling the position |
| At a loss | Otherwise | **Hold**, with stop = P − 2×ATR |
| In profit | Composite < 40 | **Take profit** |
| In profit | Weight > 35%, RSI ≥ 70 or %B > 1 | **Trim**: sell down to the cap, or a third of the position |
| In profit | Composite ≥ 70, uptrend, RSI < 65, weight < 20% | **Buy more** |
| In profit | Otherwise | **Hold**, with a trailing stop of max(P − 2×ATR, cost × (1 + target)) |

At a loss, the break-even gain is L/(1 − L): a 20% fall needs +25%. When the chance of breaking
even within three months is under 20%, the summary says plainly that a full recovery will most
likely take longer.

Confidence is **high** when the composite is ≥ 20 points from 50 and the fundamental and technical
scores agree, **medium** when it is ≥ 10 points from 50, and **low** otherwise.

## Tests

- `advisor-math.spec.ts`: known answers for every formula (normal table, Gordon growth, RSI at the
  extremes, a beta of 2 for a 2× series, VaR on a uniform grid), plus a check that the Monte Carlo
  agrees with the closed form.
- `portfolio-advisor.spec.ts`: loss and profit paths, weight cap and trailing stop, exits removed
  from the rebalance, determinism, the empty portfolio, and fundamentals being independent of
  stock splits.
- `advisor.component.spec.ts`: rendering, recomputing on a target change, the MKT-503 fallback,
  and the error state.

## Limits and follow-ups

1. **Fundamentals are a hand-entered snapshot.** Add a fundamentals source to the ETL layer and
   serve it from a table. `analyseFundamentals` only needs the same fields.
2. **One year of candles for eight symbols.** A holding outside them is listed as not analysed.
   The market proxy is those eight, not an index.
3. **GBM assumes normal log-returns** and constant volatility. Fat tails make the real 5% tail
   worse than shown, which is why expected shortfall is shown beside VaR.
4. **No taxes or fees** in the rebalance. Selling at a loss can be worth more after tax
   (tax-loss harvesting), and the advisor does not model that.
