import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { PnlValueComponent } from '../../shared/ui/pnl-value.component';
import { Holding, TradeApiError } from '../../shared/models/order.models';

/**
 * Settled holdings page: the same table shape as positions. A filled DELIVERY
 * buy is moved here about 15 seconds after it first appears in positions, and
 * its positions row is removed at the same moment.
 */
@Component({
  selector: 'app-holdings',
  imports: [RouterLink, CurrencyPipe, DecimalPipe, PnlValueComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Holdings</h1>
          <p>Settled shares at live price. Positions move here about 15 seconds after their fill.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary"
            type="button"
            data-testid="holdings-refresh"
            [attr.aria-disabled]="isLoading() ? 'true' : null"
            (click)="refresh()"
          >
            {{ isLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-primary" routerLink="/positions" data-testid="holdings-to-positions">Positions</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="holdings-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header">
          <div>
            <h2 id="holdings-heading">Settled holdings</h2>
            <p class="tp-num" role="status" data-testid="holdings-count">
              {{ isLoading() ? 'Loading holdings…' : holdings().length + (holdings().length === 1 ? ' holding' : ' holdings') }}
            </p>
          </div>
        </div>

        @if (errorMessage(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert" data-testid="holdings-error"><span>{{ message }}</span></div>
          </div>
        } @else if (holdings().length === 0) {
          @if (!isLoading()) {
            <div class="tp-empty" data-testid="holdings-empty">
              <strong>No settled holdings</strong>
              Positions move here about 15 seconds after their fill settles.
            </div>
          }
        } @else {
          <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Holdings table">
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
                @for (holding of holdings(); track holding.symbol) {
                  <tr data-testid="holding-row" [attr.data-symbol]="holding.symbol">
                    <td><strong>{{ holding.symbol }}</strong></td>
                    <td class="num">{{ holding.quantity | number }}</td>
                    <td class="num">{{ holding.averageCost | currency }}</td>
                    <td class="num">{{ (holding.currentPrice ?? holding.averageCost) | currency }}</td>
                    <td class="num">{{ (holding.marketValue ?? holding.quantity * holding.averageCost) | currency }}</td>
                    <td class="num" data-testid="holding-unrealized-pnl">
                      <app-pnl-value [value]="holding.unrealizedPnl" />
                    </td>
                    <td class="num" data-testid="holding-unrealized-pnl-percent">
                      <app-pnl-value kind="percent" [value]="holding.unrealizedPnlPercent" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `
})
export class HoldingsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly holdings = signal<Holding[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected refresh(): void {
    if (!this.isLoading()) {
      this.load();
    }
  }

  private load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tradeApi
      .getHoldings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (holdings) => {
          this.holdings.set(holdings);
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.holdings.set([]);
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
