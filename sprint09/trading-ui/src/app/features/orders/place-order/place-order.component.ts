import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { OrderSide, OrderStatus, TradeApiError } from '../../../shared/models/order.models';

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
          <p>
            Status:
            <span [ngClass]="'badge badge-' + orderStatus().toLowerCase()">{{ orderStatus() }}</span>
          </p>
          <p>{{ successMessage() }}</p>
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
  orderStatus = signal<OrderStatus>('NEW');
  isLoading = signal<boolean>(false);

  // Kept across a retry of the same submission (see onPlaceOrder).
  private idempotencyKey = '';

  constructor(
    private authService: MockAuthService,
    private orderService: TradeApiService,
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

    // accountId is 0 until the trading account has been provisioned and the
    // user has signed in again to pick it up in a fresh token.
    const accountId = parseInt(this.accountId);
    if (!accountId) {
      this.errorMessage.set(this.errorMapping.getErrorMessage('ACC-404'));
      return;
    }

    // Generate idempotencyKey (unique identifier for order idempotency)
    if (!this.idempotencyKey) {
      this.idempotencyKey = crypto.randomUUID();
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.orderService.placeOrder({
      accountId,
      symbol: this.symbol.trim().toUpperCase(),
      side: this.side as OrderSide,
      quantity: parseInt(this.quantity),
      price: parseFloat(this.price),
      idempotencyKey: this.idempotencyKey
    }).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        this.idempotencyKey = '';
        this.successMessage.set(response.message || 'Your order has been submitted.');
        this.orderId.set(response.orderId);
        this.orderStatus.set(response.status);
      },
      error: (err: TradeApiError) => {
        this.isLoading.set(false);
        if (this.errorMapping.isNetworkError(err.status)) {
          // No answer from the backend, so the order may or may not have
          // been recorded. The key is kept so that pressing submit again
          // retries the same order instead of placing a second one.
          this.errorMessage.set(this.errorMapping.getNetworkErrorMessage());
          return;
        }
        // The backend answered, so this attempt is settled; a corrected
        // resubmission is a new order and needs a new key.
        this.idempotencyKey = '';
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
    this.orderStatus.set('NEW');
    this.idempotencyKey = '';
  }
}
