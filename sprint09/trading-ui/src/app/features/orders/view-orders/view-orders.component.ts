import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { Order, OrderStatus, TradeApiError } from '../../../shared/models/order.models';

const STATUS_FILTERS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

@Component({
  selector: 'app-view-orders',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Orders</h1>
          <p>Every order on your account, newest first.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary tp-btn-icon-refresh"
            data-icon
            type="button"
            [attr.aria-disabled]="isRefreshing() ? 'true' : null"
            (click)="refreshOrders()"
          >
            {{ isRefreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new">New order</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="orders-heading" [attr.aria-busy]="isRefreshing()">
        <div class="tp-panel-header">
          <div>
            <h2 id="orders-heading">Order blotter</h2>
            <p class="tp-num" role="status">
              {{ isRefreshing() ? 'Loading orders…' : orders().length + (orders().length === 1 ? ' order' : ' orders') }}
            </p>
          </div>
          <fieldset class="tp-segmented">
            <legend class="sr-only">Filter by status</legend>
            <div class="tp-segmented-options">
              @for (filter of statusFilters; track filter.value) {
                <input
                  type="radio"
                  name="status-filter"
                  [id]="'status-' + (filter.value || 'all')"
                  [value]="filter.value"
                  [formControl]="statusFilter"
                />
                <label [for]="'status-' + (filter.value || 'all')">{{ filter.label }}</label>
              }
            </div>
          </fieldset>
        </div>

        @if (errorMessage(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert"><span>{{ message }}</span></div>
          </div>
        } @else if (orders().length === 0) {
          @if (!isRefreshing()) {
            <div class="tp-empty">
              @if (statusFilter.value) {
                <strong>No {{ statusFilter.value.toLowerCase() }} orders</strong>
                Try another status filter.
              } @else {
                <strong>No orders yet</strong>
                <a class="tp-link" routerLink="/orders/new">Place your first order</a>
              }
            </div>
          }
        } @else {
          <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Orders table">
            <table class="tp-table">
              <thead>
                <tr>
                  <th scope="col">Order ID</th>
                  <th scope="col">Created</th>
                  <th scope="col">Symbol</th>
                  <th scope="col">Side</th>
                  <th scope="col" class="num">Quantity</th>
                  <th scope="col" class="num">Limit price</th>
                  <th scope="col" class="num">Fill price</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.orderId) {
                  <tr>
                    <td class="tp-mono">{{ order.orderId }}</td>
                    <td class="tp-muted">{{ order.createdOn | date: 'MMM d, y, h:mm a' }}</td>
                    <td><strong>{{ order.symbol }}</strong></td>
                    <td>
                      <span [class.tp-positive]="order.side === 'BUY'" [class.tp-negative]="order.side === 'SELL'">
                        <strong>{{ order.side === 'BUY' ? 'Buy' : 'Sell' }}</strong>
                      </span>
                    </td>
                    <td class="num">{{ order.quantity | number }}</td>
                    <td class="num">{{ order.price | currency }}</td>
                    <td class="num">{{ (order.executedPrice | currency) ?? '—' }}</td>
                    <td><app-status-badge [status]="order.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <details class="guide">
          <summary>What do the statuses mean?</summary>
          <dl>
            <div><dt><app-status-badge status="NEW" /></dt><dd>Submitted and waiting for execution. This is the normal state.</dd></div>
            <div><dt><app-status-badge status="FILLED" /></dt><dd>Executed successfully.</dd></div>
            <div><dt><app-status-badge status="REJECTED" /></dt><dd>Rejected by the system.</dd></div>
            <div><dt><app-status-badge status="CANCELLED" /></dt><dd>Cancelled by you or the system.</dd></div>
          </dl>
        </details>
      </section>
    </div>
  `,
  styles: [`
    .guide { border-top: 1px solid var(--tp-border); font-size: 0.875rem; }
    .guide summary {
      padding: 0.75rem 1.25rem; font-weight: 500; color: var(--tp-text-muted); cursor: pointer;
    }
    .guide summary:hover { color: var(--tp-text); }
    .guide summary:focus-visible { outline: 2px solid var(--tp-focus); outline-offset: -2px; }
    .guide dl { display: grid; gap: 0.625rem; padding: 0 1.25rem 1rem; }
    .guide dl > div { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 0.75rem; }
    .guide dd { color: var(--tp-text-muted); }
  `]
})
export class ViewOrdersComponent implements OnInit {
  private readonly orderService = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly statusFilter = new FormControl<OrderStatus | ''>('', { nonNullable: true });

  protected readonly orders = signal<Order[]>([]);
  protected readonly isRefreshing = signal(false);
  protected readonly errorMessage = signal('');

  constructor() {
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loadOrders());
  }

  ngOnInit(): void {
    this.loadOrders();
  }

  protected refreshOrders(): void {
    if (!this.isRefreshing()) {
      this.loadOrders();
    }
  }

  private loadOrders(): void {
    this.isRefreshing.set(true);
    this.errorMessage.set('');

    this.orderService
      .getOrders({ status: this.statusFilter.value || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          // Sort by createdOn descending (newest first)
          this.orders.set(
            [...orders].sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime())
          );
          this.isRefreshing.set(false);
        },
        error: (err: TradeApiError) => {
          this.orders.set([]);
          this.isRefreshing.set(false);
          this.errorMessage.set(
            this.errorMapping.isNetworkError(err.status)
              ? this.errorMapping.getNetworkErrorMessage()
              : this.errorMapping.getErrorMessage(err.errorCode)
          );
        }
      });
  }
}
