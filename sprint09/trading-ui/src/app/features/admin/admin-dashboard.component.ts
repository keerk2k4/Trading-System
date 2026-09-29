import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent],
  template: `
    <app-navbar></app-navbar>

    <div class="admin-dashboard">
      <div class="dashboard-header card">
        <h1>Admin Dashboard</h1>
        <p class="subtitle">Administration Panel for {{ currentUser()?.username }}</p>
        <div class="admin-info">
          <span class="badge badge-approved">ADMIN</span>
          <p>Manage KYC submissions and user accounts</p>
        </div>
      </div>

      <div class="admin-actions grid grid-2">
        <div class="action-card card">
          <h3>📋 Review KYC Submissions</h3>
          <p>Review and approve/reject pending KYC submissions from users</p>
          <button routerLink="/admin/kyc-review" class="btn-primary">Go to KYC Review</button>
        </div>

        <div class="action-card card">
          <h3>📊 User Statistics</h3>
          <p>View platform usage and user statistics</p>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">{{ totalUsers }}</div>
              <div class="stat-label">Total Users</div>
            </div>
            <div class="stat">
              <div class="stat-value">{{ pendingKyc }}</div>
              <div class="stat-label">Pending KYC</div>
            </div>
          </div>
        </div>
      </div>

      <div class="status-section card">
        <h2>System Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <label>Auth Service:</label>
            <span class="status-badge status-active">Active</span>
          </div>
          <div class="status-item">
            <label>Trade API:</label>
            <span class="status-badge status-active">Active</span>
          </div>
          <div class="status-item">
            <label>Database:</label>
            <span class="status-badge status-active">Connected</span>
          </div>
          <div class="status-item">
            <label>Executor:</label>
            <span class="status-badge status-active">Running</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-dashboard {
      max-width: 1200px;
      margin: 0 auto;
      padding: var(--spacing-2xl) var(--spacing-lg);
    }

    .dashboard-header {
      margin-bottom: var(--spacing-2xl);
      text-align: center;
    }

    .dashboard-header h1 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
    }

    .subtitle {
      color: var(--steel-blue);
      font-size: var(--font-size-lg);
      margin-bottom: var(--spacing-md);
    }

    .admin-info {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: var(--spacing-lg);
      flex-wrap: wrap;
    }

    .admin-info p {
      margin: 0;
      color: var(--steel-blue);
    }

    .admin-actions {
      margin-bottom: var(--spacing-2xl);
    }

    .action-card h3 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
    }

    .action-card p {
      color: var(--steel-blue);
      margin-bottom: var(--spacing-lg);
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background-color: var(--azure-mist);
      border-radius: var(--radius-md);
      margin-top: var(--spacing-md);
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: var(--font-size-2xl);
      font-weight: bold;
      color: var(--primary);
    }

    .stat-label {
      font-size: var(--font-size-sm);
      color: var(--steel-blue);
      margin-top: var(--spacing-xs);
    }

    .status-section {
      margin-top: var(--spacing-2xl);
    }

    .status-section h2 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-lg);
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--spacing-lg);
    }

    .status-item {
      padding: var(--spacing-md);
      background-color: var(--azure-mist);
      border-radius: var(--radius-md);
      border-left: 4px solid var(--success);
    }

    .status-item label {
      display: block;
      font-weight: 600;
      color: var(--prussian-blue);
      margin: 0 0 var(--spacing-sm) 0;
    }

    .status-badge {
      display: inline-block;
      padding: var(--spacing-xs) var(--spacing-md);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-weight: 600;
    }

    .status-active {
      background-color: var(--success);
      color: white;
    }

    @media (max-width: 768px) {
      .admin-actions {
        grid-template-columns: 1fr;
      }

      .status-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AdminDashboardComponent implements OnInit {
  currentUser = signal<any>(null);
  totalUsers = 3;
  pendingKyc = 1;

  constructor(private authService: MockAuthService) {}

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.currentUser.set(user);
  }
}
