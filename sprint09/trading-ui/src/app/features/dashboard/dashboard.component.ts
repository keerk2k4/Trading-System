import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { MockKycService } from '../../shared/services/mock-kyc.service';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { Account, Position, TradeApiError } from '../../shared/models/order.models';

interface PortfolioSummary {
  cash: number;
  holdings: number;
  total: number;
  currency: string;
  asOf: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Welcome back, {{ user()?.username }}</h1>
          <p>Your cash, holdings and account at a glance.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/history">Order history</a>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new">Place order</a>
        </div>
      </header>

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert"><span>{{ message }}</span></div>
      }

      <section class="tp-grid tp-grid-3" aria-label="Portfolio summary" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat tp-stat-primary">
          <p class="tp-stat-label">Total portfolio</p>
          <p class="tp-stat-value">{{ (summary()?.total | currency: currency()) ?? '—' }}</p>
          <p class="tp-stat-meta">Cash plus holdings at cost</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Available cash</p>
          <p class="tp-stat-value">{{ (summary()?.cash | currency: currency()) ?? '—' }}</p>
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
          <p class="tp-stat-meta">{{ positions().length }} open {{ positions().length === 1 ? 'position' : 'positions' }}</p>
        </div>
      </section>

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="positions-heading">
          <div class="tp-panel-header">
            <h2 id="positions-heading">Positions</h2>
            <p>Valued at average cost</p>
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
                    <th scope="col" class="num">Cost basis</th>
                  </tr>
                </thead>
                <tbody>
                  @for (position of positions(); track position.symbol) {
                    <tr>
                      <td><strong>{{ position.symbol }}</strong></td>
                      <td class="num">{{ position.quantity | number }}</td>
                      <td class="num">{{ position.averageCost | currency: currency() }}</td>
                      <td class="num">{{ position.quantity * position.averageCost | currency: currency() }}</td>
                    </tr>
                  }
                </tbody>
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
            <div><dt>Account ID</dt><dd class="tp-num">{{ user()?.accountId || '—' }}</dd></div>
            @if (account(); as acc) {
              <div><dt>Status</dt><dd><app-status-badge [status]="acc.status" /></dd></div>
            }
            <div><dt>Verification</dt><dd><app-status-badge [status]="kycStatus()" /></dd></div>
            <div><dt>User ID</dt><dd class="tp-mono">{{ user()?.id }}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  `
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
    this.loadAccountSummary(this.user()?.accountId);
  }

  private loadAccountSummary(accountId: number | undefined): void {
    // accountId is 0 until the trading account has been provisioned and the
    // user has signed in again to pick it up in a fresh token.
    if (!accountId) {
      this.errorMessage.set(this.errorMapping.getErrorMessage('ACC-404'));
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    forkJoin({
      account: this.tradeApi.getAccount(accountId),
      balance: this.tradeApi.getBalance(accountId),
      positions: this.tradeApi.getPositions(accountId)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ account, balance, positions }) => {
          // The positions endpoint carries no market price, so holdings are
          // valued at cost: quantity x average cost per position.
          const holdings = positions.reduce(
            (total, position) => total + position.quantity * position.averageCost,
            0
          );

          this.account.set(account);
          this.positions.set(positions);
          this.summary.set({
            cash: balance.cashBalance,
            holdings,
            total: balance.cashBalance + holdings,
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
