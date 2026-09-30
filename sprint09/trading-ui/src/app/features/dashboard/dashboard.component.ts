import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { MockKycService } from '../../shared/services/mock-kyc.service';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { Account, TradeApiError } from '../../shared/models/order.models';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent],
  template: `
    <app-navbar></app-navbar>

    <div class="dashboard-container">
      <div class="welcome-section card">
        <h1>Welcome, {{ currentUser()?.username }}!</h1>
        <p class="subtitle">Your Trading Dashboard</p>
        <div class="account-info">
          <div class="info-item">
            <label>Account ID:</label>
            <span>{{ currentUser()?.accountId }}</span>
          </div>
          <div class="info-item">
            <label>User ID:</label>
            <span class="user-id">{{ currentUser()?.id }}</span>
          </div>
          <div class="info-item">
            <label>KYC Status:</label>
            <span [ngSwitch]="kycStatus()">
              <span *ngSwitchCase="'APPROVED'" class="badge badge-approved">APPROVED</span>
              <span *ngSwitchCase="'PENDING'" class="badge badge-pending">PENDING</span>
              <span *ngSwitchCase="'REJECTED'" class="badge badge-rejected">REJECTED</span>
              <span *ngSwitchDefault class="badge badge-pending">NOT SUBMITTED</span>
            </span>
          </div>
          <div class="info-item" *ngIf="account() as acc">
            <label>Account Holder:</label>
            <span>{{ acc.holderName }}</span>
          </div>
          <div class="info-item" *ngIf="account() as acc">
            <label>Account Status:</label>
            <span>{{ acc.status }}</span>
          </div>
        </div>
      </div>

      <div class="actions-section">
        <h2>Trading Actions</h2>
        <div class="actions-grid grid grid-2">
          <div class="action-card card">
            <h3>Place an Order</h3>
            <p>Create a new buy or sell order</p>
            <button routerLink="/orders/new" class="btn-primary">Go to Order Form</button>
          </div>

          <div class="action-card card">
            <h3>View Orders</h3>
            <p>Check your order history and status</p>
            <button routerLink="/orders/history" class="btn-primary">View Blotter</button>
          </div>
        </div>
      </div>

      <div class="account-section card">
        <h2>Account Summary</h2>
        <div *ngIf="errorMessage()" class="alert alert-error">
          {{ errorMessage() }}
        </div>
        <p *ngIf="isLoading()" class="subtitle">Loading account summary...</p>
        <div class="summary-grid" *ngIf="!isLoading() && !errorMessage()">
          <div class="summary-item">
            <label>Available Cash:</label>
            <span class="amount">$ {{ availableCash() | number:'1.2-2' }}</span>
          </div>
          <div class="summary-item">
            <label>Holdings Value:</label>
            <span class="amount">$ {{ holdingsValue() | number:'1.2-2' }}</span>
          </div>
          <div class="summary-item">
            <label>Total Portfolio:</label>
            <span class="amount">$ {{ totalPortfolio() | number:'1.2-2' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-2xl) var(--spacing-lg);
      gap: var(--spacing-2xl);
      display: flex;
      flex-direction: column;
    }

    h1 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
    }

    .subtitle {
      color: var(--steel-blue);
      font-size: var(--font-size-lg);
      margin-bottom: var(--spacing-lg);
    }

    .account-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-md);
      background-color: var(--azure-mist);
      border-radius: var(--radius-md);
    }

    .info-item label {
      font-weight: 600;
      color: var(--prussian-blue);
      margin: 0;
    }

    .user-id {
      font-family: monospace;
      font-size: var(--font-size-sm);
      color: var(--steel-blue);
    }

    .actions-section {
      margin-top: var(--spacing-2xl);
    }

    .actions-section h2 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-lg);
    }

    .action-card {
      text-align: center;
    }

    .action-card h3 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
    }

    .action-card p {
      color: var(--steel-blue);
      margin-bottom: var(--spacing-lg);
    }

    .account-section {
      margin-top: var(--spacing-2xl);
    }

    .account-section h2 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-lg);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--spacing-lg);
    }

    .summary-item {
      padding: var(--spacing-lg);
      background-color: var(--azure-mist);
      border-radius: var(--radius-md);
      border-left: 4px solid var(--amber-glow);
    }

    .summary-item label {
      display: block;
      color: var(--steel-blue);
      margin-bottom: var(--spacing-sm);
      margin-left: 0;
    }

    .amount {
      font-size: var(--font-size-2xl);
      font-weight: bold;
      color: var(--primary);
    }

    @media (max-width: 768px) {
      .actions-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  currentUser = signal<any>(null);
  kycStatus = signal<string>('NOT_SUBMITTED');
  account = signal<Account | null>(null);
  availableCash = signal<number>(0);
  holdingsValue = signal<number>(0);
  totalPortfolio = signal<number>(0);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  constructor(
    private authService: MockAuthService,
    private kycService: MockKycService,
    private tradeApi: TradeApiService,
    private errorMapping: ErrorMappingService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.currentUser.set(user);

    if (user) {
      const status = this.kycService.getKycStatusSignal()();
      this.kycStatus.set(status || 'NOT_SUBMITTED');
    }

    this.loadAccountSummary(user?.accountId);
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
    }).subscribe({
      next: ({ account, balance, positions }) => {
        // The positions endpoint carries no market price, so holdings are
        // valued at cost: quantity x average cost per position.
        const holdings = positions.reduce(
          (total, position) => total + position.quantity * position.averageCost,
          0
        );

        this.account.set(account);
        this.availableCash.set(balance.cashBalance);
        this.holdingsValue.set(holdings);
        this.totalPortfolio.set(balance.cashBalance + holdings);
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
