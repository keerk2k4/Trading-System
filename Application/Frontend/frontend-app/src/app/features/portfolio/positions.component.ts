import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { PnlValueComponent } from '../../shared/ui/pnl-value.component';
import { Position, TradeApiError } from '../../shared/models/order.models';

/**
 * Unsettled positions page: the same table as the dashboard positions panel,
 * as its own screen. A filled DELIVERY buy waits here about 15 seconds
 * before settlement moves it to holdings (and removes this row).
 */
@Component({
  selector: 'app-positions',
  imports: [RouterLink, CurrencyPipe, DecimalPipe, PnlValueComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Positions</h1>
          <p>Unsettled fills at live price. Fresh buys move to holdings after settlement.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary"
            type="button"
            data-testid="positions-refresh"
            [attr.aria-disabled]="isLoading() ? 'true' : null"
            (click)="refresh()"
          >
            {{ isLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-primary" routerLink="/holdings" data-testid="positions-to-holdings">Holdings</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="positions-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header">
          <div>
            <h2 id="positions-heading">Open positions</h2>
            <p class="tp-num" role="status" data-testid="positions-count">
              {{ isLoading() ? 'Loading positions…' : positions().length + (positions().length === 1 ? ' position' : ' positions') }}
            </p>
          </div>
        </div>

        @if (errorMessage(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert" data-testid="positions-error"><span>{{ message }}</span></div>
          </div>
        } @else if (positions().length === 0) {
          @if (!isLoading()) {
            <div class="tp-empty" data-testid="positions-empty">
              <strong>No open positions</strong>
              Filled buy orders appear here first, then settle into holdings.
            </div>
          }
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
                    <td class="num">{{ position.averageCost | currency }}</td>
                    <td class="num">{{ (position.currentPrice ?? position.averageCost) | currency }}</td>
                    <td class="num">{{ (position.marketValue ?? position.quantity * position.averageCost) | currency }}</td>
                    <td class="num" data-testid="position-unrealized-pnl">
                      <app-pnl-value [value]="position.unrealizedPnl" />
                    </td>
                    <td class="num" data-testid="position-unrealized-pnl-percent">
                      <app-pnl-value kind="percent" [value]="position.unrealizedPnlPercent" />
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
export class PositionsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly positions = signal<Position[]>([]);
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
      .getPositions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (positions) => {
          this.positions.set(positions);
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.positions.set([]);
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
