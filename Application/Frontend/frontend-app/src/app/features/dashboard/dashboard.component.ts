import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MockAuthService } from '../../shared/services/auth.service';
import { MockKycService } from '../../shared/services/kyc.service';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PnlValueComponent } from '../../shared/ui/pnl-value.component';
import { AccountStatusNoticeComponent } from '../../shared/ui/account-status-notice.component';
import { Account, Position, TradeApiError } from '../../shared/models/order.models';

interface PortfolioSummary {
  cash: number;
  holdings: number;
  total: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number | null;
  currency: string;
  asOf: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe, StatusBadgeComponent, PnlValueComponent, AccountStatusNoticeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1 data-testid="dashboard-welcome">Welcome back, {{ user()?.username }}</h1>
          <p>Your cash, holdings and account at a glance.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/history">Order history</a>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new">Place order</a>
        </div>
      </header>

      <app-account-status-notice [status]="account()?.status" />

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="dashboard-error"><span>{{ message }}</span></div>
      }

      <section class="tp-grid tp-grid-3" aria-label="Portfolio summary" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat tp-stat-primary">
          <p class="tp-stat-label">Total portfolio</p>
          <p class="tp-stat-value">{{ (summary()?.total | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">Cash plus holdings at live price</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Available cash</p>
          <p class="tp-stat-value" data-testid="dashboard-cash">{{ (summary()?.cash | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">
            @if (summary()?.asOf; as asOf) {
              As of {{ asOf | date: 'MMM d, h:mm a' }}
            } @else {
              Ready to invest
            }
          </p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Holdings value</p>
          <p class="tp-stat-value">{{ (summary()?.holdings | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta" data-testid="dashboard-position-count">{{ positions().length }} open {{ positions().length === 1 ? 'position' : 'positions' }}</p>
        </div>
      </section>

      <section class="tp-grid tp-grid-2" aria-label="Unrealized profit and loss" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Unrealized P&amp;L</p>
          <p class="tp-stat-value" data-testid="dashboard-unrealized-pnl">
            <app-pnl-value [value]="summary()?.unrealizedPnl" [currency]="currency()" />
          </p>
          <p class="tp-stat-meta">Open positions at live price vs average cost</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Unrealized P&amp;L %</p>
          <p class="tp-stat-value" data-testid="dashboard-unrealized-pnl-percent">
            <app-pnl-value kind="percent" [value]="summary()?.unrealizedPnlPercent" />
          </p>
          <p class="tp-stat-meta">Relative to total cost basis</p>
        </div>
      </section>

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="positions-heading">
          <div class="tp-panel-header">
            <h2 id="positions-heading">Positions</h2>
            <p>Live price from market-data; falls back to average cost</p>
          </div>
          @if (isLoading()) {
            <p class="tp-empty">Loading positions…</p>
          } @else if (positions().length === 0) {
            <div class="tp-empty">
              <strong>No open positions</strong>
              Filled buy orders will appear here.
            </div>
          } @else {
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Positions table">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Symbol</th>
                    <th scope="col" class="num">Quantity</th>
                    <th scope="col" class="num">Avg cost</th>
                    <th scope="col" class="num">Live price</th>
                    <th scope="col" class="num">Market value</th>
                    <th scope="col" class="num">Unrealized P&amp;L</th>
                    <th scope="col" class="num">P&amp;L %</th>
                  </tr>
                </thead>
                <tbody>
                  @for (position of positions(); track position.symbol) {
                    <tr data-testid="position-row" [attr.data-symbol]="position.symbol">
                      <td><strong>{{ position.symbol }}</strong></td>
                      <td class="num">{{ position.quantity | number }}</td>
                      <td class="num">{{ position.averageCost | currency: currency() }}</td>
                      <td class="num">{{ (position.currentPrice ?? position.averageCost) | currency: currency() }}</td>
                      <td class="num">{{ (position.marketValue ?? position.quantity * position.averageCost) | currency: currency() }}</td>
                      <!-- "—" until market-data has sent a quote for this symbol -->
                      <td class="num" data-testid="position-unrealized-pnl">
                        <app-pnl-value [value]="position.unrealizedPnl" [currency]="currency()" />
                      </td>
                      <td class="num" data-testid="position-unrealized-pnl-percent">
                        <app-pnl-value kind="percent" [value]="position.unrealizedPnlPercent" />
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr data-testid="positions-total-row">
                    <th scope="row" colspan="4">Total</th>
                    <td class="num">{{ summary()?.holdings | currency: currency() }}</td>
                    <td class="num" data-testid="positions-total-pnl">
                      <app-pnl-value [value]="summary()?.unrealizedPnl" [currency]="currency()" />
                    </td>
                    <td class="num" data-testid="positions-total-pnl-percent">
                      <app-pnl-value kind="percent" [value]="summary()?.unrealizedPnlPercent" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        </section>

        <section class="tp-panel" aria-labelledby="account-heading">
          <div class="tp-panel-header">
            <h2 id="account-heading">Account</h2>
          </div>
          <dl class="tp-details tp-panel-body">
            @if (account(); as acc) {
              <div><dt>Holder</dt><dd>{{ acc.holderName }}</dd></div>
            }
            @if (account(); as acc) {
              <div><dt>Status</dt><dd><app-status-badge data-testid="dashboard-account-status" [status]="acc.status" /></dd></div>
            }
            <div><dt>Verification</dt><dd><app-status-badge data-testid="dashboard-kyc-status" [status]="kycStatus()" /></dd></div>
          </dl>
        </section>
      </div>
    </div>
  `,
  styles: [`
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
export class DashboardComponent implements OnInit {
  private readonly authService = inject(MockAuthService);
  private readonly kycService = inject(MockKycService);
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.authService.currentUser$;
  protected readonly kycStatus = signal('NOT_SUBMITTED');
  protected readonly account = signal<Account | null>(null);
  protected readonly positions = signal<Position[]>([]);
  protected readonly summary = signal<PortfolioSummary | null>(null);
  protected readonly currency = computed(() => this.summary()?.currency || 'USD');
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    this.kycStatus.set(this.kycService.getCurrentUserKycStatus() ?? 'NOT_SUBMITTED');
    this.loadAccountSummary();
  }

  private loadAccountSummary(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    forkJoin({
      account: this.tradeApi.getAccount(),
      balance: this.tradeApi.getBalance(),
      positions: this.tradeApi.getPositions()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ account, balance, positions }) => {
          // Positions carry the latest market-data price when the backend has
          // seen a quote; otherwise fall back to average cost.
          const holdings = positions.reduce(
            (total, position) =>
              total + (position.marketValue ?? position.quantity * position.averageCost),
            0
          );

          // A position without a live quote is valued at cost, so it adds
          // nothing to P&L but still counts towards the cost basis.
          const costBasis = positions.reduce((total, position) => total + position.quantity * position.averageCost, 0);
          const unrealizedPnl = roundToCents(
            positions.reduce((total, position) => total + (position.unrealizedPnl ?? 0), 0)
          );

          this.account.set(account);
          this.positions.set(positions);
          this.summary.set({
            cash: balance.cashBalance,
            holdings,
            total: balance.cashBalance + holdings,
            unrealizedPnl,
            unrealizedPnlPercent: costBasis > 0 ? roundToCents((unrealizedPnl / costBasis) * 100) : null,
            currency: balance.currency,
            asOf: balance.asOf
          });
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
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
