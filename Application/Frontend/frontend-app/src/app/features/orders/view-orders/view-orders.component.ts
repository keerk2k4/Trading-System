import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { PnlValueComponent } from '../../../shared/ui/pnl-value.component';
import { Order, OrderStatus, TradeApiError } from '../../../shared/models/order.models';

const STATUS_FILTERS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'FILLED', label: 'Filled' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' }
];

// While any order is still NEW the blotter re-reads the list so fills and
// rejections show up without a manual refresh. Polling gives up after
// POLL_MAX_DURATION_MS so a stuck order cannot keep it going forever.
export const POLL_INTERVAL_MS = 5_000;
export const POLL_MAX_DURATION_MS = 5 * 60_000;

@Component({
  selector: 'app-view-orders',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe, StatusBadgeComponent, PnlValueComponent],
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
            data-testid="orders-refresh"
            (click)="refreshOrders()"
          >
            {{ isRefreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-primary tp-btn-icon-plus" data-icon routerLink="/orders/new" data-testid="orders-new">New order</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="orders-heading" [attr.aria-busy]="isRefreshing()">
        <div class="tp-panel-header">
          <div>
            <h2 id="orders-heading">Order blotter</h2>
            <p class="tp-num" role="status" data-testid="orders-count">
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
                <label [for]="'status-' + (filter.value || 'all')" [attr.data-testid]="'orders-filter-' + (filter.value || 'ALL')">{{ filter.label }}</label>
              }
            </div>
          </fieldset>
        </div>

        @if (errorMessage(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert" data-testid="orders-error"><span>{{ message }}</span></div>
          </div>
        } @else if (orders().length === 0) {
          @if (!isRefreshing()) {
            <div class="tp-empty" data-testid="orders-empty">
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
                  <th scope="col">Type</th>
                  <th scope="col" class="num">Quantity</th>
                  <th scope="col" class="num">Limit price</th>
                  <th scope="col" class="num">Fill price</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Realized P&amp;L</th>
                  <th scope="col" class="num">P&amp;L %</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (order of orders(); track order.orderId) {
                  <tr data-testid="order-row" [attr.data-order-id]="order.orderId">
                    <td class="tp-mono">{{ order.orderId }}</td>
                    <td class="tp-muted">{{ order.createdOn | date: 'MMM d, y, h:mm a' }}</td>
                    <td><strong>{{ order.symbol }}</strong></td>
                    <td>
                      <span [class.tp-positive]="order.side === 'BUY'" [class.tp-negative]="order.side === 'SELL'">
                        <strong>{{ order.side === 'BUY' ? 'Buy' : 'Sell' }}</strong>
                      </span>
                    </td>
                    <td data-testid="order-type">{{ order.orderType ?? 'LIMIT' }}</td>
                    <td class="num">{{ order.quantity | number }}</td>
                    <td class="num">{{ (order.price | currency) ?? '—' }}</td>
                    <td class="num">{{ (order.executedPrice | currency) ?? '—' }}</td>
                    <td><app-status-badge data-testid="order-status" [status]="order.status" /></td>
                    <!-- Only FILLED SELL orders realise P&L; everything else shows a muted dash. -->
                    <td class="num" data-testid="order-realized-pnl"><app-pnl-value [value]="order.realizedPnl" /></td>
                    <td class="num" data-testid="order-realized-pnl-percent"><app-pnl-value kind="percent" [value]="order.realizedPnlPercent" /></td>
                    <td>
                      @if (order.status === 'NEW') {
                        @if (editingOrderId() === order.orderId) {
                          <div class="tp-edit" data-testid="order-edit-form">
                            <input
                              class="tp-input tp-num"
                              type="number"
                              min="1"
                              step="1"
                              data-testid="order-edit-quantity"
                              [value]="editQuantity()"
                              (input)="editQuantity.set($any($event.target).valueAsNumber)"
                              aria-label="Updated quantity"
                            />
                            @if ((order.orderType ?? 'LIMIT') === 'LIMIT') {
                              <input
                                class="tp-input tp-num"
                                type="number"
                                min="0.01"
                                step="0.01"
                                data-testid="order-edit-price"
                                [value]="editPrice()"
                                (input)="editPrice.set($any($event.target).valueAsNumber)"
                                aria-label="Updated limit price"
                              />
                            }
                            <button
                              class="tp-btn tp-btn-primary"
                              type="button"
                              data-testid="order-edit-save"
                              [attr.aria-disabled]="isActing() ? 'true' : null"
                              (click)="saveEdit(order)"
                            >
                              {{ isActing() ? 'Saving…' : 'Save' }}
                            </button>
                            <button
                              class="tp-btn tp-btn-secondary"
                              type="button"
                              data-testid="order-edit-cancel"
                              (click)="cancelEdit()"
                            >
                              Back
                            </button>
                          </div>
                          @if (actionError(); as message) {
                            <p class="tp-field-error" data-testid="order-action-error">{{ message }}</p>
                          }
                        } @else {
                          <div class="tp-actions">
                            @if ((order.orderType ?? 'LIMIT') === 'LIMIT') {
                              <button
                                class="tp-btn tp-btn-secondary"
                                type="button"
                                data-testid="order-edit"
                                [attr.data-order-id]="order.orderId"
                                [attr.aria-disabled]="isActing() ? 'true' : null"
                                (click)="startEdit(order)"
                              >
                                Update
                              </button>
                            }
                            <button
                              class="tp-btn tp-btn-secondary"
                              type="button"
                              data-testid="order-cancel"
                              [attr.data-order-id]="order.orderId"
                              [attr.aria-disabled]="isActing() ? 'true' : null"
                              (click)="cancelOrder(order)"
                            >
                              {{ isActing() ? 'Working…' : 'Cancel' }}
                            </button>
                          </div>
                          @if (actionError() && actionOrderId() === order.orderId) {
                            <p class="tp-field-error" data-testid="order-action-error">{{ actionError() }}</p>
                          }
                        }
                      } @else {
                        <span class="tp-muted">—</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <details class="guide" data-testid="status-guide">
          <summary>What do the statuses mean?</summary>
          <dl>
            <div><dt><app-status-badge status="NEW" /></dt><dd>Submitted and waiting for execution. Limit orders stay here about 15 seconds and can be updated or cancelled; market orders fill immediately.</dd></div>
            <div><dt><app-status-badge status="FILLED" /></dt><dd>Executed successfully. Positions update at once; holdings follow after about 15 seconds of settlement.</dd></div>
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

  // Cancel/update state. Only NEW orders show actions; MARKET orders execute
  // immediately so their window is effectively zero, LIMIT orders have ~15s.
  protected readonly isActing = signal(false);
  protected readonly actionError = signal('');
  protected readonly actionOrderId = signal<string | null>(null);
  protected readonly editingOrderId = signal<string | null>(null);
  protected readonly editQuantity = signal<number | null>(null);
  protected readonly editPrice = signal<number | null>(null);

  /** True while the blotter is re-reading the list every POLL_INTERVAL_MS. */
  readonly isPolling = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollStartedAt = 0;

  constructor() {
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loadOrders());
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  ngOnInit(): void {
    this.loadOrders();
  }

  protected refreshOrders(): void {
    if (!this.isRefreshing()) {
      this.loadOrders();
    }
  }

  /** Cancel a NEW order. The blotter re-reads afterwards so the terminal state shows. */
  protected cancelOrder(order: Order): void {
    if (this.isActing()) {
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');
    this.actionOrderId.set(order.orderId);
    this.orderService.cancelOrder(order.orderId).subscribe({
      next: () => {
        this.isActing.set(false);
        this.actionOrderId.set(null);
        this.loadOrders(true);
      },
      error: (err: TradeApiError) => {
        this.isActing.set(false);
        this.actionError.set(
          this.errorMapping.isNetworkError(err.status)
            ? this.errorMapping.getNetworkErrorMessage()
            : this.errorMapping.getErrorMessage(err.errorCode)
        );
      }
    });
  }

  /** Open the inline editor seeded with the order's current values. */
  protected startEdit(order: Order): void {
    this.actionError.set('');
    this.actionOrderId.set(null);
    this.editingOrderId.set(order.orderId);
    this.editQuantity.set(order.quantity);
    this.editPrice.set(order.price ?? null);
  }

  protected cancelEdit(): void {
    this.editingOrderId.set(null);
    this.editQuantity.set(null);
    this.editPrice.set(null);
    this.actionError.set('');
  }

  /** Save quantity and/or limit price for a NEW LIMIT order. */
  protected saveEdit(order: Order): void {
    if (this.isActing()) {
      return;
    }
    const quantity = this.editQuantity();
    const price = (order.orderType ?? 'LIMIT') === 'LIMIT' ? this.editPrice() : null;
    if ((quantity === null || Number.isNaN(quantity)) && (price === null || Number.isNaN(price as number))) {
      this.actionError.set('Enter a new quantity or price.');
      return;
    }
    this.isActing.set(true);
    this.actionError.set('');
    this.actionOrderId.set(order.orderId);
    this.orderService
      .updateOrder(order.orderId, {
        ...(quantity !== null && !Number.isNaN(quantity) && quantity !== order.quantity ? { quantity } : {}),
        ...(price !== null && !(Number.isNaN(price as number)) && price !== order.price ? { price: price as number } : {})
      })
      .subscribe({
        next: () => {
          this.isActing.set(false);
          this.actionOrderId.set(null);
          this.cancelEdit();
          this.loadOrders(true);
        },
        error: (err: TradeApiError) => {
          this.isActing.set(false);
          this.actionError.set(
            this.errorMapping.isNetworkError(err.status)
              ? this.errorMapping.getNetworkErrorMessage()
              : this.errorMapping.getErrorMessage(err.errorCode)
          );
        }
      });
  }

  // A background poll leaves the loading state alone, so the table and its
  // live status message do not flicker every few seconds.
  private loadOrders(background = false): void {
    if (!background) {
      this.isRefreshing.set(true);
    }
    this.errorMessage.set('');

    // Read-only: polling only ever repeats this GET, never the order POST.
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
          this.updatePolling(orders);
        },
        error: (err: TradeApiError) => {
          this.orders.set([]);
          this.isRefreshing.set(false);
          this.stopPolling();
          this.errorMessage.set(
            this.errorMapping.isNetworkError(err.status)
              ? this.errorMapping.getNetworkErrorMessage()
              : this.errorMapping.getErrorMessage(err.errorCode)
          );
        }
      });
  }

  private updatePolling(orders: Order[]): void {
    if (!orders.some((order) => order.status === 'NEW')) {
      this.stopPolling();
      return;
    }
    if (this.pollTimer !== null) {
      return;
    }
    this.pollStartedAt = Date.now();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.isPolling.set(true);
  }

  private poll(): void {
    if (Date.now() - this.pollStartedAt >= POLL_MAX_DURATION_MS) {
      this.stopPolling();
      return;
    }
    // Skip a tick while a user-triggered load is still in flight.
    if (!this.isRefreshing()) {
      this.loadOrders(true);
    }
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling.set(false);
  }
}
