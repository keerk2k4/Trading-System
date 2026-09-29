import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockOrderService } from '../../../shared/services/mock-order.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';

@Component({
  selector: 'app-place-order',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent],
  template: `
    <app-navbar></app-navbar>

    <div class="order-container">
      <div class="order-card card">
        <h1>Place a New Order</h1>
        <p class="subtitle">Create a buy or sell order</p>

        <div *ngIf="errorMessage()" class="alert alert-error">
          {{ errorMessage() }}
        </div>

        <div *ngIf="successMessage()" class="alert alert-success">
          <strong>Order Placed Successfully!</strong>
          <p>Order ID: <strong>{{ orderId() }}</strong></p>
          <p>Status: <span class="badge badge-new">NEW</span></p>
          <p>Your order has been submitted and is waiting for execution.</p>
        </div>

        <form (ngSubmit)="onPlaceOrder()" #orderForm="ngForm" *ngIf="!successMessage()">
          <div class="form-group">
            <label for="account">Account ID</label>
            <input
              type="text"
              id="account"
              [(ngModel)]="accountId"
              name="account"
              disabled
              readonly
            />
            <small>Read-only: linked to your authenticated session</small>
          </div>

          <div class="form-group">
            <label for="symbol">Symbol</label>
            <input
              type="text"
              id="symbol"
              name="symbol"
              [(ngModel)]="symbol"
              required
              placeholder="e.g., AAPL, GOOGL, MSFT"
              maxlength="10"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="side">Buy/Sell</label>
              <select id="side" name="side" [(ngModel)]="side" required>
                <option value="" disabled>Select</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <div class="form-group">
              <label for="quantity">Quantity</label>
              <input
                type="number"
                id="quantity"
                name="quantity"
                [(ngModel)]="quantity"
                required
                min="1"
                step="1"
                placeholder="Whole numbers only"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="price">Price</label>
              <input
                type="number"
                id="price"
                name="price"
                [(ngModel)]="price"
                required
                min="0.01"
                step="0.01"
                placeholder="Max 2 decimal places"
              />
            </div>
          </div>

          <div class="validation-summary" *ngIf="getValidationErrors().length > 0">
            <strong>Please fix the following:</strong>
            <ul>
              <li *ngFor="let error of getValidationErrors()">{{ error }}</li>
            </ul>
          </div>

          <button type="submit" class="btn-primary" [disabled]="isLoading() || getValidationErrors().length > 0">
            {{ isLoading() ? 'Placing Order...' : 'Place Order' }}
          </button>
        </form>

        <div class="order-success-actions" *ngIf="successMessage()">
          <button class="btn-primary" routerLink="/orders/history">View All Orders</button>
          <button class="btn-secondary" (click)="resetForm()">Place Another Order</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .order-container {
      max-width: 600px;
      margin: var(--spacing-2xl) auto;
      padding: var(--spacing-lg);
    }

    .order-card {
      background-color: white;
    }

    h1 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
      text-align: center;
    }

    .subtitle {
      text-align: center;
      color: var(--steel-blue);
      margin-bottom: var(--spacing-lg);
    }

    .alert {
      margin-bottom: var(--spacing-md);
    }

    small {
      display: block;
      font-size: var(--font-size-sm);
      color: var(--steel-blue);
      margin-top: var(--spacing-xs);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
    }

    .validation-summary {
      background-color: #fadbd8ff;
      border-left: 4px solid var(--danger);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-md);
      color: #922b21ff;
    }

    .validation-summary strong {
      display: block;
      margin-bottom: var(--spacing-sm);
    }

    .validation-summary ul {
      margin-left: var(--spacing-lg);
      margin-bottom: 0;
    }

    .order-success-actions {
      display: flex;
      gap: var(--spacing-md);
      margin-top: var(--spacing-lg);
    }

    .order-success-actions button {
      flex: 1;
    }

    @media (max-width: 768px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class PlaceOrderComponent {
  accountId = '';
  symbol = '';
  side = '';
  quantity: any = '';
  price: any = '';

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  orderId = signal<string>('');
  isLoading = signal<boolean>(false);

  constructor(
    private authService: MockAuthService,
    private orderService: MockOrderService,
    private errorMapping: ErrorMappingService,
    private router: Router
  ) {
    const user = this.authService.getCurrentUser();
    this.accountId = user?.accountId.toString() || '';
  }

  getValidationErrors(): string[] {
    const errors: string[] = [];

    if (this.symbol && this.symbol.length < 1) {
      errors.push('Symbol is required');
    }

    if (this.side && !['BUY', 'SELL'].includes(this.side)) {
      errors.push('Valid Buy/Sell selection required');
    }

    if (this.quantity) {
      const qty = parseInt(this.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push('Quantity must be a whole number greater than 0');
      }
    }

    if (this.price) {
      const p = parseFloat(String(this.price));
      if (p <= 0) {
        errors.push('Price must be greater than 0');
      }
      const priceStr = String(this.price);
      if (priceStr.includes('.') && priceStr.split('.')[1].length > 2) {
        errors.push('Price can have at most 2 decimal places');
      }
    }

    return errors;
  }

  onPlaceOrder(): void {
    if (!this.symbol || !this.side || !this.quantity || !this.price) {
      this.errorMessage.set('All fields are required');
      return;
    }

    const validationErrors = this.getValidationErrors();
    if (validationErrors.length > 0) {
      this.errorMessage.set('Please fix validation errors before submitting');
      return;
    }

    // Generate idempotencyKey (unique identifier for order idempotency)
    const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.placeOrder({
      accountId: parseInt(this.accountId),
      symbol: this.symbol.toUpperCase(),
      side: this.side,
      quantity: parseInt(this.quantity),
      price: parseFloat(this.price),
      idempotencyKey: idempotencyKey
    }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.successMessage.set(response.message);
        this.orderId.set(response.orderId);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
      }
    });
  }

  resetForm(): void {
    this.symbol = '';
    this.side = '';
    this.quantity = '';
    this.price = '';
    this.errorMessage.set('');
    this.successMessage.set('');
    this.orderId.set('');
  }
}
