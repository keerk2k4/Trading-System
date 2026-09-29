import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { MockKycService } from '../../shared/services/mock-kyc.service';

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
        <div class="summary-grid">
          <div class="summary-item">
            <label>Available Cash:</label>
            <span class="amount">$ {{ availableCash() }}</span>
          </div>
          <div class="summary-item">
            <label>Holdings Value:</label>
            <span class="amount">$ {{ holdingsValue() }}</span>
          </div>
          <div class="summary-item">
            <label>Total Portfolio:</label>
            <span class="amount">$ {{ totalPortfolio() }}</span>
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
  availableCash = signal<string>('');
  holdingsValue = signal<string>('');
  totalPortfolio = signal<string>('');

  constructor(
    private authService: MockAuthService,
    private kycService: MockKycService
  ) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.currentUser.set(user);

    if (user) {
      const status = this.kycService.getKycStatusSignal()();
      this.kycStatus.set(status || 'NOT_SUBMITTED');
    }

    // Generate mock account values
    this.availableCash.set((Math.random() * 50000 + 10000).toFixed(2));
    this.holdingsValue.set((Math.random() * 100000 + 50000).toFixed(2));
    this.totalPortfolio.set((Math.random() * 150000 + 60000).toFixed(2));
  }
}
