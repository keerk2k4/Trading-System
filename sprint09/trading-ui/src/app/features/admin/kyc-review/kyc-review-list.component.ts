import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { KycSubmission } from '../../../shared/models/kyc.models';

@Component({
  selector: 'app-kyc-review-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  template: `
    <app-navbar></app-navbar>

    <div class="admin-container">
      <div class="admin-header">
        <h1>KYC Review Dashboard</h1>
        <p class="subtitle">Review pending KYC submissions</p>
        <button class="btn-primary" (click)="refreshSubmissions()">
          {{ isRefreshing() ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>

      <div *ngIf="pendingSubmissions().length === 0" class="empty-state card">
        <p>No pending KYC submissions</p>
      </div>

      <div *ngIf="pendingSubmissions().length > 0">
        <div *ngFor="let kyc of pendingSubmissions()" class="kyc-review-card card">
          <div class="kyc-header">
            <div class="kyc-info">
              <h3>User ID: <span class="user-id">{{ kyc.userId }}</span></h3>
              <p>Submitted: {{ formatDate(kyc.submittedAt) }}</p>
            </div>
            <span class="badge badge-pending">{{ kyc.status }}</span>
          </div>

          <div class="kyc-details">
            <div class="detail-row">
              <label>Document Type:</label>
              <span>{{ kyc.documentType }}</span>
            </div>
            <div class="detail-row">
              <label>Document Number:</label>
              <span class="doc-number">{{ kyc.documentNumber }}</span>
            </div>
            <div class="detail-row">
              <label>Date of Birth:</label>
              <span>{{ formatDateOnly(kyc.dateOfBirth) }}</span>
            </div>
          </div>

          <div class="review-actions">
            <div class="form-group">
              <label for="reason-{{kyc.id}}">Rejection Reason (if rejecting)</label>
              <textarea
                [id]="'reason-' + kyc.id"
                [(ngModel)]="rejectionReasons[kyc.id || '']"
                placeholder="Optional: Explain why KYC is rejected"
                rows="3"
              ></textarea>
            </div>

            <div class="action-buttons">
              <button class="btn-success" (click)="approveKyc(kyc)" [disabled]="isProcessing()">
                {{ isProcessing() ? 'Processing...' : 'Approve' }}
              </button>
              <button class="btn-danger" (click)="rejectKyc(kyc)" [disabled]="isProcessing()">
                {{ isProcessing() ? 'Processing...' : 'Reject' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-container {
      max-width: 1000px;
      margin: 0 auto;
      padding: var(--spacing-2xl) var(--spacing-lg);
    }

    .admin-header {
      margin-bottom: var(--spacing-2xl);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-lg);
    }

    .admin-header h1 {
      color: var(--prussian-blue);
      margin: 0;
    }

    .admin-header .subtitle {
      color: var(--steel-blue);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-2xl);
      color: var(--steel-blue);
    }

    .kyc-review-card {
      margin-bottom: var(--spacing-lg);
    }

    .kyc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--spacing-lg);
      border-bottom: 2px solid var(--azure-mist);
      padding-bottom: var(--spacing-md);
    }

    .kyc-info h3 {
      color: var(--prussian-blue);
      margin: 0 0 var(--spacing-sm) 0;
    }

    .user-id {
      font-family: monospace;
      font-size: var(--font-size-sm);
      color: var(--steel-blue);
    }

    .kyc-info p {
      margin: 0;
      color: var(--steel-blue);
      font-size: var(--font-size-sm);
    }

    .kyc-details {
      background-color: var(--azure-mist);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-md);
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: var(--spacing-sm) 0;
    }

    .detail-row label {
      font-weight: 600;
      color: var(--prussian-blue);
      margin: 0;
    }

    .detail-row span {
      color: var(--steel-blue);
    }

    .doc-number {
      font-family: monospace;
      font-weight: 600;
    }

    .review-actions {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    textarea {
      font-family: inherit;
      padding: var(--spacing-sm) var(--spacing-md);
      border: 2px solid var(--steel-blue);
      border-radius: var(--radius-md);
      color: var(--prussian-blue);
      resize: vertical;
    }

    textarea:focus {
      outline: none;
      border-color: var(--amber-glow);
    }

    .action-buttons {
      display: flex;
      gap: var(--spacing-md);
    }

    .btn-success {
      background-color: var(--success);
      color: white;
      padding: var(--spacing-sm) var(--spacing-lg);
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: 600;
      flex: 1;
    }

    .btn-success:hover:not([disabled]) {
      background-color: #27ae60ff;
    }

    .btn-danger {
      background-color: var(--danger);
      color: white;
      padding: var(--spacing-sm) var(--spacing-lg);
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: 600;
      flex: 1;
    }

    .btn-danger:hover:not([disabled]) {
      background-color: #c0392bff;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .kyc-header {
        flex-direction: column;
      }

      .action-buttons {
        flex-direction: column;
      }
    }
  `]
})
export class KycReviewListComponent implements OnInit {
  pendingSubmissions = signal<KycSubmission[]>([]);
  isRefreshing = signal<boolean>(false);
  isProcessing = signal<boolean>(false);
  rejectionReasons: { [key: string]: string } = {};

  constructor(private kycService: MockKycService) {}

  ngOnInit(): void {
    this.loadSubmissions();
  }

  loadSubmissions(): void {
    this.isRefreshing.set(true);
    this.kycService.getPendingKycSubmissions().subscribe({
      next: (submissions: KycSubmission[]) => {
        this.pendingSubmissions.set(submissions);
        this.isRefreshing.set(false);
      },
      error: () => {
        this.isRefreshing.set(false);
      }
    });
  }

  refreshSubmissions(): void {
    this.loadSubmissions();
  }

  approveKyc(kyc: KycSubmission): void {
    if (!kyc.id) return;

    this.isProcessing.set(true);
    this.kycService.reviewKyc(kyc.id, true).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.loadSubmissions(); // Refresh the list
      },
      error: () => {
        this.isProcessing.set(false);
      }
    });
  }

  rejectKyc(kyc: KycSubmission): void {
    if (!kyc.id) return;

    const reason = this.rejectionReasons[kyc.id] || 'No reason provided';

    this.isProcessing.set(true);
    this.kycService.reviewKyc(kyc.id, false, reason).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.loadSubmissions(); // Refresh the list
      },
      error: () => {
        this.isProcessing.set(false);
      }
    });
  }

  formatDate(date: Date | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDateOnly(date: string | undefined): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
