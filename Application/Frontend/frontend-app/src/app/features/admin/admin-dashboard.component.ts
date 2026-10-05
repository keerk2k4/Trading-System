import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MockAuthService } from '../../shared/services/auth.service';
import { MockKycService } from '../../shared/services/kyc.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { KycSubmission } from '../../shared/models/kyc.models';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Admin overview</h1>
          <p>Signed in as {{ user()?.username }}. Review customer verification requests.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-primary" routerLink="/admin/kyc-review" data-testid="admin-open-review">Open KYC review</a>
        </div>
      </header>

      <section class="tp-grid tp-grid-3" aria-label="Summary" [attr.aria-busy]="isLoading()">
        <div class="tp-panel tp-stat tp-stat-primary">
          <p class="tp-stat-label">Pending KYC</p>
          <p class="tp-stat-value" data-testid="admin-pending-count">{{ isLoading() ? '—' : pending().length }}</p>
          <p class="tp-stat-meta">Waiting for a decision</p>
        </div>
        <div class="tp-panel tp-stat">
          <p class="tp-stat-label">Your role</p>
          <p class="tp-stat-value role">Administrator</p>
          <p class="tp-stat-meta">Can approve or reject verification</p>
        </div>
      </section>

      <section class="tp-panel" aria-labelledby="queue-heading">
        <div class="tp-panel-header">
          <h2 id="queue-heading">Review queue</h2>
          <a class="tp-link" routerLink="/admin/kyc-review">View all</a>
        </div>
        @if (isLoading()) {
          <p class="tp-empty">Loading submissions…</p>
        } @else if (pending().length === 0) {
          <div class="tp-empty">
            <strong>All caught up</strong>
            There are no submissions waiting for review.
          </div>
        } @else {
          <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Review queue table">
            <table class="tp-table">
              <thead>
                <tr>
                  <th scope="col">Submission</th>
                  <th scope="col">User ID</th>
                  <th scope="col">Document</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (kyc of pending(); track kyc.id) {
                  <tr>
                    <td class="tp-mono">{{ kyc.id }}</td>
                    <td class="tp-mono">{{ kyc.userId }}</td>
                    <td>{{ kyc.documentType }}</td>
                    <td class="tp-muted">{{ kyc.submittedAt | date: 'MMM d, y, h:mm a' }}</td>
                    <td><app-status-badge [status]="kyc.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .role { font-size: 1.25rem; }
  `]
})
export class AdminDashboardComponent implements OnInit {
  private readonly authService = inject(MockAuthService);
  private readonly kycService = inject(MockKycService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = this.authService.currentUser$;
  protected readonly pending = signal<KycSubmission[]>([]);
  protected readonly isLoading = signal(true);

  ngOnInit(): void {
    this.kycService
      .getPendingKycSubmissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (submissions) => {
          this.pending.set(submissions);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });
  }
}
