import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockOrderService } from '../../../shared/services/mock-order.service';
import { Order } from '../../../shared/models/order.models';

@Component({
  selector: 'app-view-orders',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent],
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

      <div *ngIf="orders().length === 0" class="empty-state">
        <p>No orders yet. <a routerLink="/orders/new">Place your first order</a></p>
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
              <td><strong>{{ order.id }}</strong></td>
              <td>{{ order.symbol }}</td>
              <td>
                <span [ngClass]="order.side === 'BUY' ? 'side-buy' : 'side-sell'">
                  {{ order.side }}
                </span>
              </td>
              <td class="text-right">{{ order.quantity }}</td>
              <td class="text-right">$ {{ order.price.toFixed(2) }}</td>
              <td>
                <span [ngClass]="'badge badge-' + order.status.toLowerCase()">
                  {{ order.status }}
                </span>
              </td>
              <td>{{ formatDate(order.createdAt) }}</td>
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

  constructor(private orderService: MockOrderService) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.isRefreshing.set(true);
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        // Sort by createdAt descending (newest first)
        this.orders.set(orders.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
        this.isRefreshing.set(false);
      },
      error: () => {
        this.isRefreshing.set(false);
      }
    });
  }

  refreshOrders(): void {
    this.loadOrders();
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
