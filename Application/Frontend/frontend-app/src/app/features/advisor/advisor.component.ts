import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { PortfolioApiService } from '../../shared/services/portfolio-api.service';
import { CANDLE_SYMBOLS, CandleService } from '../../shared/services/candle.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { PnlValueComponent } from '../../shared/ui/pnl-value.component';
import { Candle } from '../../shared/models/candle.models';
import { TradeApiError } from '../../shared/models/order.models';
import { AdvisorAction, AdvisorHolding, AdvisorReport, buildAdvisorReport, chance, label } from './portfolio-advisor';

interface AdvisorData {
  holdings: AdvisorHolding[];
  cash: number;
  candles: Record<string, Candle[]>;
}

/**
 * The portfolio advisor (docs/sprint/portfolio-advisor.md): technical,
 * fundamental and strategic analysis of each holding, and what to do over
 * the next three months, either to recover a loss or to make at least the
 * target return on a profit.
 *
 * Holdings come from the portfolio routes (falling back to the unpriced
 * account positions on MKT-503, priced at the last saved close); history
 * from the saved daily candles. All the analysis runs in the browser
 * (portfolio-advisor.ts), so the target can be changed without a reload.
 */
@Component({
  selector: 'app-advisor',
  imports: [RouterLink, CurrencyPipe, DecimalPipe, PercentPipe, PnlValueComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Advisor</h1>
          <p>Technical, fundamental and strategic analysis of what you hold, and what to do over the next three months.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/portfolio">Portfolio</a>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new">Place order</a>
        </div>
      </header>

      <div class="tp-alert tp-alert-info" role="note" data-testid="advisor-disclaimer">
        <span>
          <strong>Model estimates, not financial advice.</strong>
          No model can guarantee a profit. Figures come from a year of daily prices and an approximate fundamentals
          snapshot, and every probability is the model's, not the market's.
        </span>
      </div>

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="advisor-error"><span>{{ message }}</span></div>
      }

      @if (isLoading()) {
        <p class="tp-empty" role="status">Analysing your portfolio…</p>
      } @else if (report(); as r) {
        <section class="tp-panel" aria-labelledby="advice-heading">
          <div class="tp-panel-header">
            <h2 id="advice-heading">The advice</h2>
            <form class="target" (submit)="$event.preventDefault()">
              <label class="tp-label" for="target">Minimum 3-month return</label>
              <input
                class="tp-input"
                id="target"
                type="number"
                min="1"
                max="30"
                step="1"
                [value]="targetPct()"
                (input)="setTarget($event)"
                data-testid="advisor-target"
              />
              <span class="tp-muted">%</span>
            </form>
          </div>
          <div class="tp-panel-body">
            <ul class="summary" data-testid="advisor-summary">
              @for (line of r.summary; track $index) {
                <li>{{ line }}</li>
              }
            </ul>
            @if (r.unanalysed.length > 0) {
              <p class="tp-muted note" data-testid="advisor-unanalysed">
                No price history for {{ r.unanalysed.join(', ') }}; not analysed.
              </p>
            }
          </div>
        </section>

        @if (r.metrics && r.currentForecast) {
          <section class="tp-grid tp-grid-3" aria-label="Portfolio outlook">
            <div class="tp-panel tp-stat tp-stat-primary">
              <p class="tp-stat-label">Chance of +{{ r.targetReturn | percent }} in 3 months</p>
              <p class="tp-stat-value" data-testid="advisor-probability">{{ chance(r.currentForecast.probabilities[1]) }}</p>
              <p class="tp-stat-meta">
                As held; {{ r.optimisedForecast ? chance(r.optimisedForecast.probabilities[1]) : '—' }} after the rebalance
              </p>
            </div>
            <div class="tp-panel tp-stat">
              <p class="tp-stat-label">Median 3-month return</p>
              <p class="tp-stat-value"><app-pnl-value kind="percent" [value]="r.currentForecast.median * 100" /></p>
              <p class="tp-stat-meta">
                90% range {{ r.currentForecast.p5 | percent: '1.0-1' }} to {{ r.currentForecast.p95 | percent: '1.0-1' }}
              </p>
            </div>
            <div class="tp-panel tp-stat">
              <p class="tp-stat-label">3-month Value at Risk (95%)</p>
              <p class="tp-stat-value" data-testid="advisor-var">{{ (r.currentForecast.valueAtRisk95 * r.investedValue) | currency }}</p>
              <p class="tp-stat-meta">
                {{ r.currentForecast.valueAtRisk95 | percent: '1.0-1' }} of holdings; expected shortfall
                {{ r.currentForecast.expectedShortfall95 | percent: '1.0-1' }}
              </p>
            </div>
            <div class="tp-panel tp-stat">
              <p class="tp-stat-label">Volatility and Sharpe</p>
              <p class="tp-stat-value">{{ r.metrics.volatility | percent: '1.0-1' }}</p>
              <p class="tp-stat-meta">
                Sharpe {{ r.metrics.sharpe | number: '1.2-2' }}, Sortino {{ r.metrics.sortino | number: '1.2-2' }}, max drawdown
                {{ r.metrics.maxDrawdown | percent: '1.0-1' }}
              </p>
            </div>
            <div class="tp-panel tp-stat">
              <p class="tp-stat-label">Beta to the market basket</p>
              <p class="tp-stat-value">{{ r.metrics.beta | number: '1.2-2' }}</p>
              <p class="tp-stat-meta">1-day VaR {{ r.metrics.var95Daily | percent: '1.0-2' }}</p>
            </div>
            <div class="tp-panel tp-stat">
              <p class="tp-stat-label">Diversification</p>
              <p class="tp-stat-value" data-testid="advisor-effective">{{ r.metrics.effectiveHoldings | number: '1.1-1' }}</p>
              <p class="tp-stat-meta">Effective holdings (1 / HHI, HHI {{ r.metrics.hhi | number: '1.2-2' }})</p>
            </div>
          </section>
        }

        @if (r.holdings.length > 0) {
          <section class="tp-panel" aria-labelledby="actions-heading">
            <div class="tp-panel-header">
              <h2 id="actions-heading">What to do with each holding</h2>
              <p>Stops use 2 × ATR, raised to lock in your minimum profit when the price allows</p>
            </div>
            <div class="cards">
              @for (h of r.holdings; track h.symbol) {
                <article class="card" data-testid="advice-card" [attr.data-symbol]="h.symbol">
                  <header>
                    <strong class="symbol">{{ h.symbol }}</strong>
                    <span [class]="'tp-badge ' + tone(h.action)" data-testid="advice-action">{{ label(h.action) }}</span>
                    @if (h.quantityChange !== 0) {
                      <span class="qty" data-testid="advice-quantity">
                        {{ h.quantityChange > 0 ? 'Buy' : 'Sell' }} {{ abs(h.quantityChange) }}
                      </span>
                    }
                    <span class="tp-muted conf">{{ h.confidence }} confidence</span>
                  </header>
                  <dl class="kv">
                    <div><dt>P&amp;L</dt><dd><app-pnl-value kind="percent" [value]="h.unrealisedPct * 100" /></dd></div>
                    <div><dt>Price</dt><dd>{{ h.price | currency }}</dd></div>
                    <div><dt>Avg cost</dt><dd>{{ h.averageCost | currency }}</dd></div>
                    <div><dt>Stop-loss</dt><dd data-testid="advice-stop">{{ h.stopLoss | currency }}</dd></div>
                    <div><dt>3-month median</dt><dd>{{ h.targetPrice | currency }}</dd></div>
                    <div>
                      <dt>{{ h.status === 'loss' ? 'Chance of break-even' : 'Chance of +' + (r.targetReturn * 100) + '% on cost' }}</dt>
                      <dd>{{ chance(h.goalProbability) }}</dd>
                    </div>
                  </dl>
                  <ul class="reasons">
                    @for (reason of h.reasons; track $index) {
                      <li>{{ reason }}</li>
                    }
                  </ul>
                </article>
              }
            </div>
          </section>

          <section class="tp-panel" aria-labelledby="technical-heading">
            <div class="tp-panel-header">
              <h2 id="technical-heading">Technical analysis</h2>
              <p>From daily closes; score out of 100</p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Technical analysis">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col">Trend</th>
                    <th scope="col" class="num">SMA 50</th>
                    <th scope="col" class="num">SMA 200</th>
                    <th scope="col" class="num">RSI 14</th>
                    <th scope="col" class="num">MACD hist.</th>
                    <th scope="col" class="num">Bollinger %B</th>
                    <th scope="col" class="num">ATR 14</th>
                    <th scope="col" class="num">Support</th>
                    <th scope="col" class="num">Resistance</th>
                    <th scope="col" class="num">3-mo change</th>
                    <th scope="col" class="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of r.holdings; track h.symbol) {
                    @let t = h.analysis.technical;
                    <tr data-testid="technical-row">
                      <td><strong>{{ h.symbol }}</strong></td>
                      <td>{{ t.trend }}</td>
                      <td class="num">{{ (t.sma50 | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.sma200 | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.rsi14 | number: '1.0-0') ?? '—' }}</td>
                      <td class="num">{{ (t.macd?.histogram | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.bollinger?.percentB | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.atr14 | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.support | number: '1.2-2') ?? '—' }}</td>
                      <td class="num">{{ (t.resistance | number: '1.2-2') ?? '—' }}</td>
                      <td class="num"><app-pnl-value kind="percent" [value]="t.momentum3m === null ? null : t.momentum3m * 100" /></td>
                      <td class="num"><strong>{{ t.score }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="tp-panel" aria-labelledby="fundamental-heading">
            <div class="tp-panel-header">
              <h2 id="fundamental-heading">Fundamental analysis</h2>
              <p>Approximate snapshot; DCF is two-stage with a CAPM discount rate</p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Fundamental analysis">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">P/E</th>
                    <th scope="col" class="num">PEG</th>
                    <th scope="col" class="num">ROE</th>
                    <th scope="col" class="num">Debt/equity</th>
                    <th scope="col" class="num">Piotroski</th>
                    <th scope="col" class="num">Altman Z</th>
                    <th scope="col" class="num">Discount rate</th>
                    <th scope="col" class="num">DCF value</th>
                    <th scope="col" class="num">Margin of safety</th>
                    <th scope="col" class="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of r.holdings; track h.symbol) {
                    @if (h.analysis.fundamental; as f) {
                      <tr data-testid="fundamental-row">
                        <td><strong>{{ h.symbol }}</strong></td>
                        <td class="num">{{ f.fundamentals.pe }}</td>
                        <td class="num">{{ (f.peg | number: '1.2-2') ?? '—' }}</td>
                        <td class="num">{{ f.fundamentals.roePct }}%</td>
                        <td class="num">{{ f.fundamentals.debtToEquity }}</td>
                        <td class="num">{{ f.fundamentals.piotroski }}/9</td>
                        <td class="num">{{ f.fundamentals.altmanZ }} ({{ f.altmanZone }})</td>
                        <td class="num">{{ f.discountRate | percent: '1.1-1' }}</td>
                        <td class="num">{{ f.intrinsicValue | currency }}</td>
                        <td class="num"><app-pnl-value kind="percent" [value]="f.marginOfSafety * 100" /></td>
                        <td class="num"><strong>{{ f.score }}</strong></td>
                      </tr>
                    } @else {
                      <tr>
                        <td><strong>{{ h.symbol }}</strong></td>
                        <td colspan="10" class="tp-muted">No fundamentals available</td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="tp-panel" aria-labelledby="risk-heading">
            <div class="tp-panel-header">
              <h2 id="risk-heading">Risk and outlook</h2>
              <p>One year of daily returns, annualised; composite = 40% fundamental + 35% technical + 25% risk</p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Risk and outlook">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">Weight</th>
                    <th scope="col" class="num">Volatility</th>
                    <th scope="col" class="num">Beta</th>
                    <th scope="col" class="num">Sharpe</th>
                    <th scope="col" class="num">Sortino</th>
                    <th scope="col" class="num">Max drawdown</th>
                    <th scope="col" class="num">1-day VaR</th>
                    <th scope="col" class="num">Expected return</th>
                    <th scope="col" class="num">P(up, 3 mo)</th>
                    <th scope="col" class="num">Risk score</th>
                    <th scope="col" class="num">Composite</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of r.holdings; track h.symbol) {
                    @let k = h.analysis.risk;
                    <tr data-testid="risk-row">
                      <td><strong>{{ h.symbol }}</strong></td>
                      <td class="num">{{ h.weight | percent: '1.0-1' }}</td>
                      <td class="num">{{ k.volatility | percent: '1.0-1' }}</td>
                      <td class="num">{{ k.beta | number: '1.2-2' }}</td>
                      <td class="num">{{ k.sharpe | number: '1.2-2' }}</td>
                      <td class="num">{{ k.sortino | number: '1.2-2' }}</td>
                      <td class="num">{{ k.maxDrawdown | percent: '1.0-1' }}</td>
                      <td class="num">{{ k.var95 | percent: '1.0-2' }}</td>
                      <td class="num">{{ h.analysis.expectedReturn | percent: '1.0-1' }}</td>
                      <td class="num">{{ chance(h.analysis.probabilityUp3m) }}</td>
                      <td class="num">{{ k.score }}</td>
                      <td class="num"><strong>{{ h.analysis.compositeScore }}</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (r.rebalance.length > 0) {
          <section class="tp-panel" aria-labelledby="rebalance-heading">
            <div class="tp-panel-header">
              <h2 id="rebalance-heading">Suggested rebalance</h2>
              <p>
                Half-way to the maximum-Sharpe mix (cap {{ maxWeight | percent }} each); sells first, they fund the buys
              </p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Suggested rebalance">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">Now</th>
                    <th scope="col" class="num">Target</th>
                    <th scope="col">Trade</th>
                    <th scope="col" class="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of r.rebalance; track t.symbol) {
                    <tr data-testid="rebalance-row" [attr.data-symbol]="t.symbol">
                      <td><strong>{{ t.symbol }}</strong></td>
                      <td class="num">{{ t.currentWeight | percent: '1.0-1' }}</td>
                      <td class="num">{{ t.targetWeight | percent: '1.0-1' }}</td>
                      <td>
                        <span class="tp-badge" [class.tp-badge-positive]="t.quantity > 0" [class.tp-badge-warning]="t.quantity < 0">
                          {{ t.quantity > 0 ? 'Buy' : 'Sell' }} {{ abs(t.quantity) }}
                        </span>
                      </td>
                      <td class="num"><app-pnl-value [value]="t.value" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (r.correlation.symbols.length > 1) {
          <section class="tp-panel" aria-labelledby="correlation-heading">
            <div class="tp-panel-header">
              <h2 id="correlation-heading">Correlation of daily returns</h2>
              <p>Close to 1 means two holdings rise and fall together and add little diversification</p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Correlation matrix">
              <table class="tp-table corr">
                <thead>
                  <tr>
                    <th scope="col"></th>
                    @for (s of r.correlation.symbols; track s) {
                      <th scope="col" class="num">{{ s }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of r.correlation.matrix; track $index; let i = $index) {
                    <tr>
                      <th scope="row">{{ r.correlation.symbols[i] }}</th>
                      @for (value of row; track $index) {
                        <td class="num" [style.background-color]="corrColour(value)">{{ value | number: '1.2-2' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (r.ideas.length > 0) {
          <section class="tp-panel" aria-labelledby="ideas-heading">
            <div class="tp-panel-header">
              <h2 id="ideas-heading">Instruments you do not hold that score well</h2>
              <p>Candidates for new money or for proceeds from a sale</p>
            </div>
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Ideas">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">Price</th>
                    <th scope="col" class="num">Fundamental</th>
                    <th scope="col" class="num">Technical</th>
                    <th scope="col" class="num">Risk</th>
                    <th scope="col" class="num">Composite</th>
                    <th scope="col" class="num">P(up, 3 mo)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (idea of r.ideas; track idea.symbol) {
                    <tr data-testid="idea-row" [attr.data-symbol]="idea.symbol">
                      <td><strong>{{ idea.symbol }}</strong></td>
                      <td class="num">{{ idea.price | currency }}</td>
                      <td class="num">{{ idea.fundamental?.score ?? '—' }}</td>
                      <td class="num">{{ idea.technical.score }}</td>
                      <td class="num">{{ idea.risk.score }}</td>
                      <td class="num"><strong>{{ idea.compositeScore }}</strong></td>
                      <td class="num">{{ chance(idea.probabilityUp3m) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <details class="tp-panel method">
          <summary>How the advisor works</summary>
          <div class="tp-panel-body">
            <p><strong>Technical.</strong> SMA 50/200 trend, RSI (Wilder, 14), MACD (12, 26, 9), Bollinger %B (20, 2σ),
              ATR (14), 60-day support and resistance, on-balance-volume slope and 3-month momentum.</p>
            <p><strong>Fundamental.</strong> PEG = P/E ÷ EPS growth; two-stage DCF, V = Σ FCFₜ/(1+r)ᵗ + TV/(1+r)¹⁰ with
              TV = FCF₁₀(1+g)/(r−g), r = rf + β·ERP (CAPM); ROE, debt/equity, Piotroski F-Score, Altman Z-Score.</p>
            <p><strong>Strategic.</strong> Annualised volatility σ√252, Sharpe and Sortino, beta = Cov(r, m)/Var(m) against an
              equal-weight basket, maximum drawdown, historical VaR, HHI = Σw², and a correlated Monte Carlo (Cholesky,
              geometric Brownian motion) of the next 63 trading days. The rebalance moves half-way to a long-only
              maximum-Sharpe portfolio found by sampling the efficient frontier.</p>
            <p><strong>Expected return.</strong> μ = ½ historical + ½ CAPM, tilted by up to ±4% a year by the composite score.
              Probability of reaching a price K is N(d₂), d₂ = (ln(S/K) + (μ − σ²/2)T) / (σ√T).</p>
            <p><strong>Rules.</strong> At a loss: a weak composite (&lt; 40) exits; a strong one (≥ 60) that is oversold or near
              support averages down within a {{ maxWeight | percent }} cap and half your cash; otherwise hold with a stop.
              In profit: a weak composite takes profit; overbought or over the cap trims; otherwise hold with a trailing
              stop that locks in the minimum return.</p>
          </div>
        </details>
      }
    </div>
  `,
  styles: [`
    .note { margin: 0.75rem 0 0; font-size: 0.8125rem; }
    .target { display: flex; align-items: center; gap: 0.5rem; }
    .target .tp-label { margin: 0; white-space: nowrap; }
    .target .tp-input { width: 5rem; }
    .summary { margin: 0; padding-left: 1.25rem; display: grid; gap: 0.5rem; line-height: 1.5; }
    .cards { display: grid; gap: 1rem; padding: 1rem 1.25rem 1.25rem; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); }
    .card { border: 1px solid var(--tp-border); border-radius: var(--tp-radius-lg); padding: 1rem; background: var(--tp-surface-raised); }
    .card header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
    .symbol { font-size: 1.125rem; }
    .qty { font-weight: 600; font-size: 0.875rem; }
    .conf { margin-left: auto; font-size: 0.8125rem; }
    .kv { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem 1rem; margin: 0 0 0.75rem; }
    .kv dt { font-size: 0.75rem; color: var(--tp-text-muted); }
    .kv dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
    .reasons { margin: 0; padding-left: 1.125rem; display: grid; gap: 0.25rem; font-size: 0.875rem; line-height: 1.45; }
    .corr th[scope='row'] { text-align: left; }
    .method summary { cursor: pointer; padding: 1rem 1.25rem; font-weight: 600; }
    .method p { margin: 0 0 0.75rem; line-height: 1.55; font-size: 0.875rem; }
    @media (max-width: 600px) { .kv { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `]
})
export class AdvisorComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly portfolioApi = inject(PortfolioApiService);
  private readonly candles = inject(CandleService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<AdvisorData | null>(null);
  protected readonly targetPct = signal(5);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly report = computed<AdvisorReport | null>(() => {
    const data = this.data();
    if (!data) {
      return null;
    }
    return buildAdvisorReport({
      holdings: data.holdings,
      cash: data.cash,
      candlesBySymbol: data.candles,
      targetReturn: this.targetPct() / 100
    });
  });

  protected readonly maxWeight = 0.35;
  protected readonly chance = chance;
  protected readonly label = label;
  protected readonly abs = Math.abs;

  ngOnInit(): void {
    this.isLoading.set(true);
    this.tradeApi
      .getAccount()
      .pipe(
        switchMap((account) =>
          forkJoin({
            holdings: this.portfolioApi.getPositions(account.id).pipe(
              map((positions) =>
                positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, averageCost: p.averageCost, lastPrice: p.lastPrice ?? null }))
              ),
              // MKT-503: no quote for anything; analyse at the last saved close instead.
              catchError((err: TradeApiError) =>
                err.errorCode === 'MKT-503'
                  ? this.tradeApi
                      .getPositions()
                      .pipe(map((positions) => positions.map((p) => ({ symbol: p.symbol, quantity: p.quantity, averageCost: p.averageCost, lastPrice: null }))))
                  : throwError(() => err)
              )
            ),
            cash: this.tradeApi.getBalance().pipe(map((balance) => balance.cashBalance)),
            candles: forkJoin(
              Object.fromEntries(
                CANDLE_SYMBOLS.map((symbol) => [symbol, this.candles.getCandles(symbol).pipe(catchError(() => of([] as Candle[])))])
              )
            )
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(
            this.errorMapping.isNetworkError(err.status)
              ? this.errorMapping.getNetworkErrorMessage()
              : this.errorMapping.getErrorMessage(err.errorCode)
          );
        }
      });
  }

  protected setTarget(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 1 && value <= 30) {
      this.targetPct.set(value);
    }
  }

  protected tone(action: AdvisorAction): string {
    switch (action) {
      case 'BUY_MORE':
      case 'AVERAGE_DOWN':
        return 'tp-badge-positive';
      case 'TRIM':
      case 'TAKE_PROFIT':
        return 'tp-badge-warning';
      case 'EXIT':
        return 'tp-badge-negative';
      default:
        return '';
    }
  }

  /** Positive correlation tinted toward the negative colour (less diversification), negative toward positive. */
  protected corrColour(value: number): string {
    const strength = Math.round(Math.min(Math.abs(value), 1) * 28);
    const colour = value >= 0 ? 'var(--tp-negative)' : 'var(--tp-positive)';
    return `color-mix(in srgb, ${colour} ${strength}%, transparent)`;
  }
}
