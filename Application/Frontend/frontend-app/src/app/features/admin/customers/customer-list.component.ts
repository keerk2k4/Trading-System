import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminCustomerService } from '../../../shared/services/admin-customer.service';
import { ACCOUNT_STATUSES, CustomerAccountStatus, CustomerRow } from '../../../shared/models/admin-customer.models';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { adminErrorMessage } from './admin-error-message';

/**
 * Admin "Customers": find a customer by name, username, account number or
 * account status, and open their account. Opens on the newest accounts.
 */
@Component({
  selector: 'app-customer-list',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Customers</h1>
          <p>Find a customer and open their account to see its activity or change its status.</p>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="search-heading">
        <div class="tp-panel-header"><h2 id="search-heading">Search</h2></div>
        <div class="tp-panel-body">
          <form class="tp-form" [formGroup]="form" (ngSubmit)="search()" role="search">
            <div class="tp-form-row">
              <div>
                <label class="tp-label" for="customer-query">Name or username</label>
                <input
                  class="tp-input"
                  id="customer-query"
                  type="search"
                  formControlName="query"
                  autocomplete="off"
                  data-testid="customer-query"
                  [attr.aria-invalid]="queryError() ? 'true' : null"
                  [attr.aria-describedby]="queryError() ? 'customer-query-error' : null"
                />
                @if (queryError(); as message) {
                  <p class="tp-field-error" id="customer-query-error">{{ message }}</p>
                }
              </div>
              <div>
                <label class="tp-label" for="customer-account">Account number</label>
                <input class="tp-input" id="customer-account" type="search" formControlName="accountNumber" autocomplete="off" data-testid="customer-account-number" />
              </div>
              <div>
                <label class="tp-label" for="customer-status">Account status</label>
                <select class="tp-input" id="customer-status" formControlName="status" data-testid="customer-status">
                  <option value="">Any status</option>
                  @for (status of statuses; track status) {
                    <option [value]="status">{{ status }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="tp-actions">
              <button class="tp-btn tp-btn-primary" type="submit" data-testid="customer-search">Search</button>
              <button class="tp-btn tp-btn-secondary" type="button" (click)="clear()">Clear</button>
            </div>
          </form>
        </div>
      </section>

      <section class="tp-panel" aria-labelledby="results-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header"><h2 id="results-heading">{{ resultsHeading() }}</h2></div>
        @if (errorMessage(); as message) {
          <div class="tp-alert tp-alert-error" role="alert" data-testid="customer-error"><span>{{ message }}</span></div>
        } @else if (isLoading()) {
          <p class="tp-muted" data-testid="customer-loading">Loading customers…</p>
        } @else if (rows().length === 0) {
          <div class="tp-empty" data-testid="customer-empty"><strong>No customers found</strong> Try a different name, number or status.</div>
        } @else {
          <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Customers table">
            <table class="tp-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Account</th>
                  <th scope="col">Status</th>
                  <th scope="col">KYC</th>
                  <th scope="col">Cash</th>
                  <th scope="col">Opened</th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track row.userId + (row.account?.id ?? '')) {
                  <tr data-testid="customer-row">
                    <td>
                      @if (row.profile; as profile) {
                        <strong>{{ profile.firstName }} {{ profile.lastName }}</strong>
                        <span class="tp-muted"> &#64;{{ profile.username }}</span>
                      } @else {
                        <span class="tp-muted">Unknown customer</span>
                      }
                    </td>
                    <td>
                      @if (row.account; as account) {
                        <a class="tp-link tp-mono" [routerLink]="['/admin/customers', account.id]" data-testid="customer-open">{{ account.accountNumber }}</a>
                      } @else {
                        <span class="tp-muted">No trading account</span>
                      }
                    </td>
                    <td>
                      @if (row.account; as account) {
                        <app-status-badge [status]="account.status" />
                      }
                    </td>
                    <td>
                      @if (row.profile; as profile) {
                        <app-status-badge [status]="profile.kycStatus" />
                      }
                    </td>
                    <td class="tp-num">{{ row.account ? (row.account.cashBalance | currency) : '—' }}</td>
                    <td class="tp-muted">{{ row.account ? (row.account.createdAt | date: 'MMM d, y') : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `
})
export class CustomerListComponent implements OnInit {
  private readonly customers = inject(AdminCustomerService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    query: [''],
    accountNumber: [''],
    status: ['' as CustomerAccountStatus | '']
  });

  protected readonly rows = signal<CustomerRow[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly queryError = signal('');
  protected readonly resultsHeading = signal('Newest accounts');

  ngOnInit(): void {
    this.load();
  }

  protected search(): void {
    const query = this.form.controls.query.value.trim();
    if (query.length === 1) {
      this.queryError.set('Enter at least 2 characters of a name or username.');
      return;
    }
    this.queryError.set('');
    this.load();
  }

  protected clear(): void {
    this.form.reset();
    this.queryError.set('');
    this.load();
  }

  private load(): void {
    const { query, accountNumber, status } = this.form.getRawValue();
    const filtered = Boolean(query.trim() || accountNumber.trim() || status);
    this.resultsHeading.set(filtered ? 'Results' : 'Newest accounts');
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.customers
      .search({ query, accountNumber, status: status || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.isLoading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.rows.set([]);
          this.isLoading.set(false);
          this.errorMessage.set(adminErrorMessage(err));
        }
      });
  }
}
