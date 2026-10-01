import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { KycSubmission } from '../../../shared/models/kyc.models';

@Component({
  selector: 'app-kyc-review-list',
  imports: [DatePipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>KYC review</h1>
          <p>Approve or reject pending identity verification requests.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary tp-btn-icon-refresh"
            data-icon
            type="button"
            [attr.aria-disabled]="isRefreshing() ? 'true' : null"
            (click)="refreshSubmissions()"
          >
            {{ isRefreshing() ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
      </header>

      <p class="sr-only" role="status">{{ statusMessage() }}</p>

      @if (pendingSubmissions().length === 0) {
        <div class="tp-panel tp-empty">
          @if (isRefreshing()) {
            Loading submissions…
          } @else {
            <strong>All caught up</strong>
            There are no pending KYC submissions.
          }
        </div>
      }

      @for (kyc of pendingSubmissions(); track kyc.id) {
        <section class="tp-panel" [attr.aria-labelledby]="'kyc-' + kyc.id">
          <div class="tp-panel-header">
            <div>
              <h2 [id]="'kyc-' + kyc.id">Submission {{ kyc.id }}</h2>
              <p>Submitted {{ kyc.submittedAt | date: 'MMM d, y, h:mm a' }}</p>
            </div>
            <app-status-badge [status]="kyc.status" />
          </div>

          <div class="tp-panel-body review">
            <dl class="tp-details">
              <div><dt>User ID</dt><dd class="tp-mono">{{ kyc.userId }}</dd></div>
              <div><dt>Document type</dt><dd>{{ kyc.documentType }}</dd></div>
              <div><dt>Document number</dt><dd class="tp-mono">{{ kyc.documentNumber }}</dd></div>
              <div><dt>Date of birth</dt><dd>{{ kyc.dateOfBirth | date: 'longDate' }}</dd></div>
            </dl>

            <div class="decision">
              <label class="tp-label" [for]="'reason-' + kyc.id">Rejection reason <span class="tp-muted">(optional)</span></label>
              <textarea
                class="tp-input"
                rows="3"
                [id]="'reason-' + kyc.id"
                [value]="rejectionReasons[kyc.id || ''] || ''"
                (input)="setReason(kyc, $event)"
              ></textarea>
              <div class="tp-actions">
                <button
                  class="tp-btn tp-btn-primary"
                  type="button"
                  [attr.aria-disabled]="isProcessing() ? 'true' : null"
                  (click)="approveKyc(kyc)"
                >
                  {{ processingId() === kyc.id ? 'Processing…' : 'Approve' }}
                </button>
                <button
                  class="tp-btn tp-btn-danger"
                  type="button"
                  [attr.aria-disabled]="isProcessing() ? 'true' : null"
                  (click)="rejectKyc(kyc)"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .review { display: grid; gap: 1.5rem; }
    .decision { display: grid; gap: 0.75rem; align-content: start; }
    .decision .tp-label { margin: 0; }
    @media (min-width: 56rem) { .review { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  `]
})
export class KycReviewListComponent implements OnInit {
  private readonly kycService = inject(MockKycService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pendingSubmissions = signal<KycSubmission[]>([]);
  protected readonly isRefreshing = signal(false);
  protected readonly processingId = signal<string | null>(null);
  protected readonly isProcessing = computed(() => this.processingId() !== null);
  protected readonly statusMessage = signal('');
  protected readonly rejectionReasons: Record<string, string> = {};

  ngOnInit(): void {
    this.loadSubmissions();
  }

  protected refreshSubmissions(): void {
    if (!this.isRefreshing()) {
      this.loadSubmissions();
    }
  }

  protected setReason(kyc: KycSubmission, event: Event): void {
    if (kyc.id) {
      this.rejectionReasons[kyc.id] = (event.target as HTMLTextAreaElement).value;
    }
  }

  protected approveKyc(kyc: KycSubmission): void {
    this.review(kyc, true);
  }

  protected rejectKyc(kyc: KycSubmission): void {
    this.review(kyc, false, (kyc.id && this.rejectionReasons[kyc.id]) || 'No reason provided');
  }

  private review(kyc: KycSubmission, approved: boolean, reason?: string): void {
    if (!kyc.id || this.isProcessing()) {
      return;
    }

    this.processingId.set(kyc.id);
    this.kycService
      .reviewKyc(kyc.userId, approved, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.statusMessage.set(`Submission ${kyc.id} ${approved ? 'approved' : 'rejected'}.`);
          this.loadSubmissions(); // Refresh the list
        },
        error: () => {
          this.processingId.set(null);
          this.statusMessage.set(`Submission ${kyc.id} could not be updated. Try again.`);
        }
      });
  }

  private loadSubmissions(): void {
    this.isRefreshing.set(true);
    this.kycService
      .getPendingKycSubmissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (submissions: KycSubmission[]) => {
          this.pendingSubmissions.set(submissions);
          this.isRefreshing.set(false);
        },
        error: () => {
          this.isRefreshing.set(false);
        }
      });
  }
}
