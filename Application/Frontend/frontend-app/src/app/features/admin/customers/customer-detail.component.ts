import { Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, KeyValuePipe } from '@angular/common';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminCustomerService } from '../../../shared/services/admin-customer.service';
import { CustomerAccountStatus, CustomerDetailView } from '../../../shared/models/admin-customer.models';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { AccessFactsComponent } from '../../../shared/ui/access-facts.component';
import { adminErrorMessage } from './admin-error-message';

interface StatusInfo {
  /** The admin's action that moves an account to this status, as a card title. */
  action: string;
  /** What the status means for the customer, in a sentence. */
  effect: string;
  signIn: boolean;
  orders: boolean;
  /** Cannot be undone, so the choice is drawn as a warning. */
  permanent?: boolean;
}

/** Shown for the current status and on each status the admin may choose. */
const STATUS_INFO: Record<string, StatusInfo> = {
  PENDING: { action: 'Pending', effect: 'Waiting for KYC approval before it can trade.', signIn: true, orders: false },
  ACTIVE: { action: 'Reactivate', effect: 'Full access again: the customer can sign in and trade.', signIn: true, orders: true },
  SUSPENDED: { action: 'Suspend', effect: 'The customer can still sign in and view the account, but every order is refused.', signIn: true, orders: false },
  BLOCKED: { action: 'Block', effect: "The customer is signed out at once and can't sign in again until reactivated.", signIn: false, orders: false },
  CLOSED: { action: 'Close', effect: "The account is shut for good. This can't be undone.", signIn: false, orders: false, permanent: true }
};
const UNKNOWN_STATUS: StatusInfo = { action: '', effect: '', signIn: false, orders: false };

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim() ? null : { blank: true };
}

/**
 * Admin view of one customer's account: who they are, what the account holds
 * and has done, its status history, and the status change form. The form only
 * offers the statuses the Trade API allows from the current one.
 */
@Component({
  selector: 'app-customer-detail',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, KeyValuePipe, StatusBadgeComponent, AccessFactsComponent],
  template: `
    <div class="tp-page">
      <a class="tp-link" routerLink="/admin/customers">&larr; All customers</a>

      @if (loadError(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="detail-error"><span>{{ message }}</span></div>
      } @else if (view(); as v) {
        <header class="detail-header">
          <div class="detail-title">
            <h1 data-testid="detail-name">
              {{ v.profile ? v.profile.firstName + ' ' + v.profile.lastName : 'Unknown customer' }}
            </h1>
            <app-status-badge data-testid="detail-status" [status]="v.detail.account.status" />
          </div>
          <p class="tp-muted">
            <span class="tp-mono">{{ v.detail.account.accountNumber }}</span>
            @if (v.profile; as p) {
              <span> · &#64;{{ p.username }}</span>
            }
          </p>
        </header>

        <div class="tp-grid tp-grid-2">
          <section class="tp-panel" aria-labelledby="customer-heading">
            <div class="tp-panel-header"><h2 id="customer-heading">Customer</h2></div>
            <div class="tp-panel-body">
              @if (v.profile; as p) {
                <dl class="tp-details">
                  <div><dt>Username</dt><dd>{{ p.username }}</dd></div>
                  <div><dt>Email</dt><dd>{{ p.email ?? '—' }}</dd></div>
                  <div><dt>Phone</dt><dd>{{ p.phone ?? '—' }}</dd></div>
                  <div><dt>Verification</dt><dd><app-status-badge [status]="p.kycStatus" /></dd></div>
                  <div><dt>User ID</dt><dd class="tp-mono">{{ p.userId }}</dd></div>
                </dl>
              } @else {
                <p class="tp-muted">The customer's details could not be loaded.</p>
              }
            </div>
          </section>

          <section class="tp-panel" aria-labelledby="account-heading">
            <div class="tp-panel-header"><h2 id="account-heading">Account</h2></div>
            <div class="tp-panel-body">
              <dl class="tp-details">
                <div><dt>Cash</dt><dd class="tp-num">{{ v.detail.account.cashBalance | currency }}</dd></div>
                <div><dt>Open positions</dt><dd class="tp-num" data-testid="detail-positions">{{ v.detail.openPositions }}</dd></div>
                <div>
                  <dt>Orders</dt>
                  <dd data-testid="detail-orders">
                    @for (entry of v.detail.ordersByStatus | keyvalue; track entry.key) {
                      <span class="order-count">{{ entry.value }} {{ entry.key.toLowerCase() }}</span>
                    } @empty {
                      None yet
                    }
                  </dd>
                </div>
                <div><dt>Last order</dt><dd>{{ v.detail.lastOrderAt ? (v.detail.lastOrderAt | date: 'MMM d, y, HH:mm') : '—' }}</dd></div>
                <div><dt>Opened</dt><dd>{{ v.detail.account.createdAt | date: 'MMM d, y' }}</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <section class="tp-panel" aria-labelledby="change-heading">
          <div class="tp-panel-header"><h2 id="change-heading">Change status</h2></div>
          <div class="tp-panel-body">
            @if (successMessage(); as message) {
              <div class="tp-alert tp-alert-success" role="status" tabindex="-1" data-testid="change-success"><span>{{ message }}</span></div>
            }
            @if (changeError(); as message) {
              <div class="tp-alert tp-alert-error" role="alert" data-testid="change-error"><span>{{ message }}</span></div>
            }

            <div class="current" data-testid="change-current">
              <div class="current-status">
                <span class="tp-muted">Current status</span>
                <app-status-badge [status]="v.detail.account.status" />
              </div>
              <app-access-facts
                [signIn]="info(v.detail.account.status).signIn"
                [orders]="info(v.detail.account.status).orders"
              />
            </div>

            @if (v.detail.allowedNextStatuses.length === 0) {
              <p data-testid="change-closed">This account is closed. Closing is permanent, so its status cannot change.</p>
            } @else {
              <form class="tp-form" [formGroup]="form" (ngSubmit)="changeStatus()">
                <fieldset class="tp-choice-cards" [attr.aria-describedby]="shows('status') ? 'change-status-error' : null">
                  <legend class="tp-label">Change to</legend>
                  @for (status of v.detail.allowedNextStatuses; track status) {
                    <label
                      class="tp-choice-card"
                      [class.is-danger]="info(status).permanent"
                      [attr.data-testid]="'change-to-' + status"
                    >
                      <span class="tp-choice-card-head">
                        <span class="tp-choice-card-title" data-testid="change-title">
                          <input type="radio" formControlName="status" [value]="status" />
                          {{ info(status).action }}
                        </span>
                        @if (info(status).permanent) {
                          <span class="tp-badge tp-badge-negative">Permanent</span>
                        }
                      </span>
                      <span class="tp-choice-card-text">{{ info(status).effect }}</span>
                      <app-access-facts [signIn]="info(status).signIn" [orders]="info(status).orders" />
                    </label>
                  }
                </fieldset>
                @if (shows('status')) {
                  <p class="tp-field-error" id="change-status-error">Choose the new status.</p>
                }

                <div class="form-tail">
                <div>
                  <label class="tp-label" for="change-reason">Reason</label>
                  <textarea
                    class="tp-input"
                    id="change-reason"
                    rows="3"
                    maxlength="500"
                    formControlName="reason"
                    data-testid="change-reason"
                    [attr.aria-invalid]="shows('reason') ? 'true' : null"
                    [attr.aria-describedby]="shows('reason') ? 'change-reason-error' : 'change-reason-hint'"
                  ></textarea>
                  @if (shows('reason')) {
                    <p class="tp-field-error" id="change-reason-error">Give a reason. It is kept in the account's history.</p>
                  } @else {
                    <p class="tp-hint" id="change-reason-hint">Kept in the account's history with your name and the time.</p>
                  }
                </div>

                @if (values().status === 'CLOSED') {
                  <div>
                    <label class="confirm" data-testid="change-confirm-close">
                      <input type="checkbox" formControlName="confirmClose" />
                      <span>I understand that closing this account is permanent and cannot be undone.</span>
                    </label>
                    @if (shows('confirmClose')) {
                      <p class="tp-field-error">Confirm that you mean to close the account.</p>
                    }
                  </div>
                }

                <div class="tp-actions">
                  <button
                    type="submit"
                    data-testid="change-submit"
                    [class]="values().status === 'CLOSED' ? 'tp-btn tp-btn-danger' : 'tp-btn tp-btn-primary'"
                    [attr.aria-disabled]="isSaving() ? 'true' : null"
                  >
                    {{ isSaving() ? 'Saving…' : submitLabel() }}
                  </button>
                </div>
                </div>
              </form>
            }
          </div>
        </section>

        <section class="tp-panel" aria-labelledby="history-heading">
          <div class="tp-panel-header"><h2 id="history-heading">Status history</h2></div>
          @if (v.detail.statusHistory.length === 0) {
            <p class="tp-panel-body tp-muted" data-testid="history-empty">No status changes have been made by an admin.</p>
          } @else {
            <ol class="history">
              @for (change of v.detail.statusHistory; track $index) {
                <li data-testid="history-row">
                  <div class="history-head">
                    <span class="change-pair">
                      <app-status-badge [status]="change.fromStatus" />
                      <span class="tp-muted" aria-label="to">&rarr;</span>
                      <app-status-badge [status]="change.toStatus" />
                    </span>
                    <time class="tp-muted" [attr.datetime]="change.changedAt">{{ change.changedAt | date: 'MMM d, y, HH:mm' }}</time>
                  </div>
                  <p class="history-reason">{{ change.reason }}</p>
                  <p class="history-by tp-muted" [title]="change.changedBy">By admin {{ change.changedBy.slice(0, 8) }}</p>
                </li>
              }
            </ol>
          }
        </section>
      } @else {
        <p class="tp-muted" data-testid="detail-loading">Loading account…</p>
      }
    </div>
  `,
  styles: [`
    .detail-header p { margin: 0.25rem 0 0; }
    .detail-title { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
    .detail-title h1 { margin: 0; }
    .current { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1.5rem;
      padding: 0.75rem 1rem; margin-bottom: 1.25rem; border: 1px solid var(--tp-border); border-radius: var(--tp-radius);
      background-color: var(--tp-surface-sunken); }
    .current-status { display: flex; align-items: center; gap: 0.625rem; font-size: 0.875rem; }
    .form-tail { display: flex; flex-direction: column; gap: 1rem; max-width: 40rem; }
    .confirm { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.75rem 1rem; font-size: 0.875rem;
      border: 1px solid var(--tp-danger-border); border-radius: var(--tp-radius); background-color: var(--tp-danger-surface); cursor: pointer; }
    .confirm input { flex: none; width: 1rem; height: 1rem; margin: 0.125rem 0 0; accent-color: var(--tp-danger); }
    .history { list-style: none; margin: 0; padding: 0; }
    .history li { padding: 0.875rem 1.25rem; }
    .history li + li { border-top: 1px solid var(--tp-border); }
    .history-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.375rem 1rem; font-size: 0.875rem; }
    .history-reason { margin: 0.5rem 0 0.125rem; }
    .history-by { margin: 0; font-size: 0.8125rem; }
    .change-pair { display: inline-flex; align-items: center; gap: 0.375rem; white-space: nowrap; }
    .order-count:not(:last-child)::after { content: ', '; }
  `]
})
export class CustomerDetailComponent implements OnInit {
  private readonly customers = inject(AdminCustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    status: ['' as CustomerAccountStatus | '', Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(500), notBlank]],
    confirmClose: [false]
  });
  protected readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly view = signal<CustomerDetailView | null>(null);
  protected readonly loadError = signal('');
  protected readonly changeError = signal('');
  protected readonly successMessage = signal('');
  protected readonly isSaving = signal(false);
  // Names the action about to happen, so "Close account permanently" is never
  // hidden behind a generic "Change status".
  protected readonly submitLabel = computed(() => {
    const status = this.values().status;
    if (!status) {
      return 'Change status';
    }
    return status === 'CLOSED' ? 'Close account permanently' : `${STATUS_INFO[status].action} account`;
  });
  private readonly submitted = signal(false);
  private readonly accountId = computed(() => this.view()?.detail.account.id ?? 0);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.load(Number(params.get('accountId')));
    });
  }

  protected info(status: string): StatusInfo {
    return STATUS_INFO[status] ?? UNKNOWN_STATUS;
  }

  protected shows(name: 'status' | 'reason' | 'confirmClose'): boolean {
    if (!this.submitted()) {
      return false;
    }
    if (name === 'confirmClose') {
      return this.values().status === 'CLOSED' && !this.form.controls.confirmClose.value;
    }
    return this.form.controls[name].invalid;
  }

  protected changeStatus(): void {
    if (this.isSaving()) {
      return;
    }
    this.submitted.set(true);
    this.changeError.set('');
    this.successMessage.set('');
    const { status, reason, confirmClose } = this.form.getRawValue();
    if (this.form.invalid || !status || (status === 'CLOSED' && !confirmClose)) {
      return;
    }

    this.isSaving.set(true);
    this.customers
      .changeStatus(this.accountId(), status, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => {
          this.isSaving.set(false);
          this.view.set(view);
          this.form.reset();
          this.submitted.set(false);
          this.successMessage.set(`Account status changed to ${status}.`);
          afterNextRender(
            () => this.host.nativeElement.querySelector<HTMLElement>('[data-testid="change-success"]')?.focus(),
            { injector: this.injector }
          );
        },
        error: (err: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.changeError.set(adminErrorMessage(err));
          // The status may have moved on under us: show what it is now.
          if (err.error?.errorCode === 'ACC-409') {
            this.form.controls.status.setValue('');
            this.load(this.accountId(), true);
          }
        }
      });
  }

  private load(accountId: number, keepMessages = false): void {
    this.loadError.set('');
    if (!keepMessages) {
      this.changeError.set('');
      this.successMessage.set('');
    }
    this.customers
      .detail(accountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (view) => this.view.set(view),
        error: (err: HttpErrorResponse) => this.loadError.set(adminErrorMessage(err))
      });
  }
}
