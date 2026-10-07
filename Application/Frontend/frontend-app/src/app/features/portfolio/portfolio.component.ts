import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { PortfolioApiService } from '../../shared/services/portfolio-api.service';
import { CANDLE_SYMBOLS, CandleService } from '../../shared/services/candle.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { PnlValueComponent } from '../../shared/ui/pnl-value.component';
import { PortfolioValueChartComponent } from '../../shared/ui/portfolio-value-chart.component';
import { Candle } from '../../shared/models/candle.models';
import { TradeApiError } from '../../shared/models/order.models';
import {
  Pnl,
  PnlFilter,
  PortfolioHistoryPoint,
  PortfolioSummary,
  PricedPosition
} from '../../shared/models/portfolio.models';
import { buildPortfolioHistory } from './portfolio-history';

/**
 * Priced holdings and profit and loss (contracts/portfolio-api.yaml).
 *
 * Every figure comes from the portfolio routes; nothing is totalled here.
 * When no holding can be priced (MKT-503) the screen falls back to the
 * unpriced positions from the account routes rather than showing nothing.
 * A stale or missing price is shown and marked, never passed off as live.
 *
 * The value-over-time chart is separate from the contract: it is rebuilt in
 * the browser from the filled orders and the saved daily candles.
 */
@Component({
  selector: 'app-portfolio',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe, PnlValueComponent, PortfolioValueChartComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Portfolio</h1>
          <p>What you hold, what it is worth now, and what you have made or lost.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/history">Order history</a>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new">Place order</a>
        </div>
      </header>

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="portfolio-error"><span>{{ message }}</span></div>
      }
      @if (pricingUnavailable()) {
        <div class="tp-alert tp-alert-info" role="status" data-testid="portfolio-pricing-unavailable">
          <span>
            <strong>Prices are unavailable right now.</strong>
            Your holdings are shown at cost below; values and unrealised P&amp;L will return when prices do.
          </span>
        </div>
      } @else if (summary()?.partial) {
        <div class="tp-alert tp-alert-info" role="status" data-testid="portfolio-partial">
          <span>
            <strong>Some holdings could not be priced.</strong>
            Totals include only the priced holdings; the others are marked below.
          </span>
        </div>
      } @else if (hasStalePrices()) {
        <div class="tp-alert tp-alert-info" role="status" data-testid="portfolio-stale">
          <span>
            <strong>Some prices are delayed.</strong>
            Marked holdings use the last price received; check the time shown beside each.
          </span>
        </div>
      }

      <section class="tp-grid tp-grid-3" aria-label="Portfolio value" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat tp-stat-primary">
          <p class="tp-stat-label">Total value</p>
          <p class="tp-stat-value" data-testid="portfolio-total">{{ (summary()?.totalValue | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">
            @if (summary()?.asOf; as asOf) {
              Cash plus holdings, as of {{ asOf | date: 'MMM d, h:mm a' }}
            } @else {
              Cash plus holdings at market value
            }
          </p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Cash</p>
          <p class="tp-stat-value" data-testid="portfolio-cash">{{ (cash() | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">Available to invest</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Market value</p>
          <p class="tp-stat-value" data-testid="portfolio-market-value">{{ (summary()?.marketValue | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">
            {{ positions().length }} {{ positions().length === 1 ? 'holding' : 'holdings' }}, cost
            {{ (summary()?.costBasis | currency: currency()) ?? '—' }}
          </p>
        </div>
      </section>

      <section class="tp-grid tp-grid-3" aria-label="Profit and loss" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Unrealised P&amp;L</p>
          <p class="tp-stat-value" data-testid="portfolio-unrealised">
            <app-pnl-value [value]="summary()?.unrealisedPnl" [currency]="currency()" />
          </p>
          <p class="tp-stat-meta">
            <app-pnl-value kind="percent" [value]="summary()?.unrealisedPnlPercent" /> on cost; on paper, moves with the price
          </p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Realised P&amp;L</p>
          <p class="tp-stat-value" data-testid="portfolio-realised">
            <app-pnl-value [value]="summary()?.realisedPnl" [currency]="currency()" />
          </p>
          <p class="tp-stat-meta">Locked in by sales, all time</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Total P&amp;L</p>
          <p class="tp-stat-value" data-testid="portfolio-total-pnl">
            <app-pnl-value [value]="totalPnl()" [currency]="currency()" />
          </p>
          <p class="tp-stat-meta">Realised plus unrealised</p>
        </div>
      </section>

      <section class="tp-panel" aria-labelledby="history-heading">
        <div class="tp-panel-header">
          <h2 id="history-heading">Value over time</h2>
          <p>
            Rebuilt from your filled orders and daily closing prices
            @if (historyEnd(); as end) { to {{ end }} } — not live.
          </p>
        </div>
        <div class="tp-panel-body">
          @if (historyLoading()) {
            <p class="tp-muted" role="status">Loading history…</p>
          } @else {
            <app-portfolio-value-chart [points]="history()" [currency]="currency()" [benchmarkSymbols]="benchmarkSymbols()" />
            @if (historyMissing().length > 0) {
              <p class="tp-muted note" data-testid="portfolio-history-missing">
                No daily prices saved for {{ historyMissing().join(', ') }}; left out of the chart.
              </p>
            }
          }
        </div>
      </section>

      <section class="tp-panel" aria-labelledby="holdings-heading">
        <div class="tp-panel-header">
          <h2 id="holdings-heading">Holdings</h2>
          <p>Priced at the latest quote; a marked price is delayed or missing</p>
        </div>
        @if (isLoading()) {
          <p class="tp-empty">Loading holdings…</p>
        } @else if (positions().length === 0) {
          <div class="tp-empty">
            <strong>No holdings yet</strong>
            Filled buy orders will appear here.
          </div>
        } @else {
          <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Holdings table">
            <table class="tp-table">
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col" class="num">Quantity</th>
                  <th scope="col" class="num">Avg cost</th>
                  <th scope="col" class="num">Cost basis</th>
                  <th scope="col" class="num">Last price</th>
                  <th scope="col" class="num">Market value</th>
                  <th scope="col" class="num">Unrealised P&amp;L</th>
                  <th scope="col" class="num">P&amp;L %</th>
                  <th scope="col">Price as of</th>
                </tr>
              </thead>
              <tbody>
                @for (position of positions(); track position.symbol) {
                  <tr data-testid="holding-row" [attr.data-symbol]="position.symbol">
                    <td><strong>{{ position.symbol }}</strong></td>
                    <td class="num">{{ position.quantity | number }}</td>
                    <td class="num">{{ position.averageCost | currency: position.currency }}</td>
                    <td class="num">{{ position.costBasis | currency: position.currency }}</td>
                    <td class="num">{{ (position.lastPrice | currency: position.currency) ?? '—' }}</td>
                    <td class="num">{{ (position.marketValue | currency: position.currency) ?? '—' }}</td>
                    <td class="num"><app-pnl-value [value]="position.unrealisedPnl" [currency]="position.currency" /></td>
                    <td class="num"><app-pnl-value kind="percent" [value]="position.unrealisedPnlPercent" /></td>
                    <td class="as-of">
                      @if (position.lastPrice === null || position.lastPrice === undefined) {
                        <span class="tp-badge tp-badge-warning" data-testid="holding-unpriced">No price</span>
                      } @else {
                        <span class="tp-muted">{{ (position.priceAsOf | date: 'MMM d, h:mm a') ?? '—' }}</span>
                        @if (position.stale) {
                          <span class="tp-badge tp-badge-warning" data-testid="holding-stale">Delayed</span>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <section class="tp-panel" aria-labelledby="pnl-heading">
        <div class="tp-panel-header">
          <h2 id="pnl-heading">Profit and loss by instrument</h2>
          <p>The dates limit realised P&amp;L only; unrealised is always as of now</p>
        </div>
        <form class="tp-panel-body pnl-filter" (submit)="$event.preventDefault(); applyPnlFilter()" data-testid="pnl-filter">
          <div class="tp-form-row">
            <label class="tp-label" for="pnl-from">From</label>
            <input class="tp-input" id="pnl-from" type="date" [value]="pnlFrom()" (input)="pnlFrom.set(inputValue($event))" data-testid="pnl-from" />
          </div>
          <div class="tp-form-row">
            <label class="tp-label" for="pnl-to">To</label>
            <input class="tp-input" id="pnl-to" type="date" [value]="pnlTo()" (input)="pnlTo.set(inputValue($event))" data-testid="pnl-to" />
          </div>
          <div class="filter-actions">
            <button class="tp-btn tp-btn-secondary" type="submit" data-testid="pnl-apply">Apply</button>
            @if (pnlFrom() || pnlTo()) {
              <button class="tp-btn tp-btn-secondary" type="button" (click)="clearPnlFilter()">Clear</button>
            }
          </div>
        </form>
        @if (pnlError(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert" data-testid="pnl-error"><span>{{ message }}</span></div>
          </div>
        } @else if (pnl(); as p) {
          @if ((p.bySymbol ?? []).length === 0) {
            <div class="tp-empty">
              <strong>No profit or loss in this period</strong>
              Sales and open holdings will appear here.
            </div>
          } @else {
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Profit and loss by instrument">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">Realised</th>
                    <th scope="col" class="num">Unrealised</th>
                    <th scope="col" class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of p.bySymbol; track row.symbol) {
                    <tr data-testid="pnl-row" [attr.data-symbol]="row.symbol">
                      <td><strong>{{ row.symbol }}</strong></td>
                      <td class="num"><app-pnl-value [value]="row.realisedPnl" [currency]="p.baseCurrency" /></td>
                      <td class="num"><app-pnl-value [value]="row.unrealisedPnl" [currency]="p.baseCurrency" /></td>
                      <td class="num"><app-pnl-value [value]="row.totalPnl" [currency]="p.baseCurrency" /></td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr data-testid="pnl-total-row">
                    <th scope="row">Total</th>
                    <td class="num"><app-pnl-value [value]="p.realisedPnl" [currency]="p.baseCurrency" /></td>
                    <td class="num"><app-pnl-value [value]="p.unrealisedPnl" [currency]="p.baseCurrency" /></td>
                    <td class="num"><app-pnl-value [value]="p.totalPnl" [currency]="p.baseCurrency" /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        }
      </section>
    </div>
  `,
  styles: [`
    .note { margin: 0.5rem 0 0; font-size: 0.8125rem; }
    .as-of { white-space: nowrap; }
    .as-of .tp-badge { margin-left: 0.375rem; }
    .pnl-filter { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.75rem; }
    .pnl-filter .tp-form-row { margin: 0; }
    .filter-actions { display: flex; gap: 0.5rem; }
    tfoot th,
    tfoot td {
      padding: 0.75rem 1.25rem;
      font-weight: 600;
      white-space: nowrap;
      border-top: 1px solid var(--tp-border);
    }
    tfoot th { text-align: left; color: var(--tp-text); }
  `]
})
export class PortfolioComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly portfolioApi = inject(PortfolioApiService);
  private readonly candles = inject(CandleService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  private accountId: number | null = null;

  protected readonly summary = signal<PortfolioSummary | null>(null);
  protected readonly positions = signal<PricedPosition[]>([]);
  protected readonly fallbackCash = signal<number | null>(null);
  protected readonly pricingUnavailable = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly pnl = signal<Pnl | null>(null);
  protected readonly pnlError = signal('');
  protected readonly pnlFrom = signal('');
  protected readonly pnlTo = signal('');

  protected readonly history = signal<PortfolioHistoryPoint[]>([]);
  protected readonly historyMissing = signal<string[]>([]);
  protected readonly benchmarkSymbols = signal<string[]>([]);
  protected readonly historyLoading = signal(false);

  protected readonly currency = computed(() => this.summary()?.baseCurrency || 'USD');
  protected readonly cash = computed(() => this.summary()?.cashBalance ?? this.fallbackCash());
  protected readonly totalPnl = computed(() => {
    const summary = this.summary();
    return summary ? roundToCents(summary.unrealisedPnl + summary.realisedPnl) : null;
  });
  protected readonly hasStalePrices = computed(() => this.positions().some((p) => p.stale));
  protected readonly historyEnd = computed(() => this.history().at(-1)?.date ?? null);

  ngOnInit(): void {
    this.isLoading.set(true);
    this.tradeApi
      .getAccount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.accountId = account.id;
          this.loadPortfolio(account.id);
          this.loadPnl();
          this.loadHistory();
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.messageFor(err));
        }
      });
  }

  protected applyPnlFilter(): void {
    this.loadPnl();
  }

  protected clearPnlFilter(): void {
    this.pnlFrom.set('');
    this.pnlTo.set('');
    this.loadPnl();
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private loadPortfolio(accountId: number): void {
    forkJoin({
      summary: this.portfolioApi.getSummary(accountId),
      positions: this.portfolioApi.getPositions(accountId)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, positions }) => {
          this.summary.set(summary);
          this.positions.set(positions);
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          if (err.errorCode === 'MKT-503') {
            this.showUnpricedHoldings();
            return;
          }
          this.isLoading.set(false);
          this.errorMessage.set(this.messageFor(err));
        }
      });
  }

  /** MKT-503: degrade to the account's unpriced positions and cash. */
  private showUnpricedHoldings(): void {
    this.pricingUnavailable.set(true);
    forkJoin({ positions: this.tradeApi.getPositions(), balance: this.tradeApi.getBalance() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ positions, balance }) => {
          this.fallbackCash.set(balance.cashBalance);
          this.positions.set(
            positions.map((p) => ({
              accountId: p.accountId,
              symbol: p.symbol,
              quantity: p.quantity,
              averageCost: p.averageCost,
              costBasis: roundToCents(p.quantity * p.averageCost),
              lastPrice: null,
              marketValue: null,
              unrealisedPnl: null,
              unrealisedPnlPercent: null,
              currency: balance.currency,
              priceAsOf: null,
              stale: true
            }))
          );
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.messageFor(err));
        }
      });
  }

  private loadPnl(): void {
    if (this.accountId === null) {
      return;
    }
    const filter: PnlFilter = { from: this.pnlFrom() || undefined, to: this.pnlTo() || undefined };
    this.pnlError.set('');
    this.portfolioApi
      .getPnl(this.accountId, filter, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pnl) => this.pnl.set(pnl),
        error: (err: TradeApiError) => {
          this.pnl.set(null);
          this.pnlError.set(
            err.errorCode === 'VAL-422' ? 'The start date must be on or before the end date.' : this.messageFor(err)
          );
        }
      });
  }

  /**
   * Filled orders replayed against the saved daily candles. Every instrument with
   * saved candles is loaded, traded or not, for the market comparison line.
   */
  private loadHistory(): void {
    this.historyLoading.set(true);
    this.tradeApi
      .getOrders({ status: 'FILLED' })
      .pipe(
        switchMap((orders) => {
          const traded = orders.map((order) => order.symbol.toUpperCase()).filter((symbol) => this.candles.hasCandles(symbol));
          const known = orders.length === 0 ? [] : [...new Set([...traded, ...CANDLE_SYMBOLS])];
          const candles$: Observable<Record<string, Candle[]>> =
            known.length === 0
              ? of({})
              : forkJoin(
                  Object.fromEntries(
                    known.map((symbol) => [symbol, this.candles.getCandles(symbol).pipe(catchError(() => of([] as Candle[])))])
                  )
                );
          return candles$.pipe(map((bySymbol) => buildPortfolioHistory(orders, bySymbol)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ points, missingSymbols, benchmarkSymbols }) => {
          this.history.set(points);
          this.historyMissing.set(missingSymbols);
          this.benchmarkSymbols.set(benchmarkSymbols);
          this.historyLoading.set(false);
        },
        error: () => {
          this.history.set([]);
          this.historyLoading.set(false);
        }
      });
  }

  private messageFor(err: TradeApiError): string {
    return this.errorMapping.isNetworkError(err.status)
      ? this.errorMapping.getNetworkErrorMessage()
      : this.errorMapping.getErrorMessage(err.errorCode);
  }
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
