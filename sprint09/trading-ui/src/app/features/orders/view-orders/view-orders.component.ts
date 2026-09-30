import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { Order, OrderStatus, TradeApiError } from '../../../shared/models/order.models';

@Component({
  selector: 'app-view-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent],
  template: `
    <app-navbar></app-navbar>

    <div class="orders-container">
      <div class="orders-header">
        <h1>Order Blotter</h1>
        <p class="subtitle">View your trading orders and status</p>
        <button class="btn-primary" (click)="refreshOrders()">
          {{ isRefreshing() ? 'Refreshing...' : 'Refresh Orders' }}
        </button>
      </div>

      <div class="orders-filter">
        <label for="statusFilter">Status</label>
        <select id="statusFilter" name="statusFilter" [(ngModel)]="statusFilter" (ngModelChange)="loadOrders()">
          <option value="">All</option>
          <option value="NEW">NEW</option>
          <option value="FILLED">FILLED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </div>

      <div *ngIf="errorMessage()" class="alert alert-error">
        {{ errorMessage() }}
      </div>

      <div *ngIf="!errorMessage() && !isRefreshing() && orders().length === 0" class="empty-state">
        <p *ngIf="!statusFilter">No orders yet. <a routerLink="/orders/new">Place your first order</a></p>
        <p *ngIf="statusFilter">No {{ statusFilter }} orders found.</p>
      </div>

      <div *ngIf="orders().length > 0" class="table-container">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Status</th>
              <th>Created At</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let order of orders()">
              <td><strong>{{ order.orderId }}</strong></td>
              <td>{{ order.symbol }}</td>
              <td>
                <span [ngClass]="order.side === 'BUY' ? 'side-buy' : 'side-sell'">
                  {{ order.side }}
                </span>
              </td>
              <td class="text-right">{{ order.quantity }}</td>
              <td class="text-right">$ {{ order.price | number:'1.2-2' }}</td>
              <td>
                <span [ngClass]="'badge badge-' + order.status.toLowerCase()">
                  {{ order.status }}
                </span>
              </td>
              <td>{{ formatDate(order.createdOn) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="status-legend">
        <h3>Status Guide</h3>
        <div class="legend-items">
          <div class="legend-item">
            <span class="badge badge-new">NEW</span>
            <span>Order submitted and waiting for execution (normal state)</span>
          </div>
          <div class="legend-item">
            <span class="badge badge-filled">FILLED</span>
            <span>Order executed successfully</span>
          </div>
          <div class="legend-item">
            <span class="badge badge-rejected">REJECTED</span>
            <span>Order rejected by the system</span>
          </div>
          <div class="legend-item">
            <span class="badge badge-cancelled">CANCELLED</span>
            <span>Order cancelled by user or system</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .orders-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-2xl) var(--spacing-lg);
    }

    .orders-header {
      margin-bottom: var(--spacing-2xl);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-lg);
    }

    .orders-header h1 {
      color: var(--prussian-blue);
      margin: 0;
      flex: 1;
      min-width: 200px;
    }

    .subtitle {
      color: var(--steel-blue);
      margin: 0;
    }

    .orders-filter {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-lg);
    }

    .orders-filter label {
      margin: 0;
      font-weight: 600;
      color: var(--prussian-blue);
    }

    .orders-filter select {
      width: auto;
      min-width: 160px;
    }

    .alert {
      margin-bottom: var(--spacing-lg);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-2xl);
      background-color: white;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
      color: var(--steel-blue);
    }

    .table-container {
      background-color: white;
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      box-shadow: var(--shadow-md);
      overflow-x: auto;
    }

    .side-buy {
      color: var(--success);
      font-weight: 600;
    }

    .side-sell {
      color: var(--danger);
      font-weight: 600;
    }

    .status-legend {
      margin-top: var(--spacing-2xl);
      padding: var(--spacing-lg);
      background-color: white;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
    }

    .status-legend h3 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-lg);
    }

    .legend-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: var(--spacing-lg);
    }

    .legend-item {
      display: flex;
      gap: var(--spacing-md);
      align-items: center;
    }

    .legend-item .badge {
      white-space: nowrap;
      flex-shrink: 0;
    }

    .legend-item span:last-child {
      color: var(--steel-blue);
      font-size: var(--font-size-sm);
    }

    @media (max-width: 768px) {
      .orders-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .orders-header button {
        width: 100%;
      }

      .table-container {
        padding: var(--spacing-md);
      }

      table {
        font-size: var(--font-size-sm);
      }

      th, td {
        padding: var(--spacing-sm);
      }
    }
  `]
})
export class ViewOrdersComponent implements OnInit {
  orders = signal<Order[]>([]);
  isRefreshing = signal<boolean>(false);
  errorMessage = signal<string>('');
  statusFilter: OrderStatus | '' = '';

  constructor(
    private authService: MockAuthService,
    private orderService: TradeApiService,
    private errorMapping: ErrorMappingService
  ) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    // accountId is 0 until the trading account has been provisioned and the
    // user has signed in again to pick it up in a fresh token.
    const accountId = this.authService.getCurrentUser()?.accountId;
    if (!accountId) {
      this.orders.set([]);
      this.errorMessage.set(this.errorMapping.getErrorMessage('ACC-404'));
      return;
    }

    this.isRefreshing.set(true);
    this.errorMessage.set('');

    this.orderService.getOrders(accountId, { status: this.statusFilter || undefined }).subscribe({
      next: (orders) => {
        // Sort by createdOn descending (newest first)
        this.orders.set([...orders].sort((a, b) =>
          new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
        ));
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

  refreshOrders(): void {
    this.loadOrders();
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
