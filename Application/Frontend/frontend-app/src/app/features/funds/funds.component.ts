import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { TradeApiError } from '../../shared/models/order.models';

const MAX_INTEGER_DIGITS = 14;

function hasValidIntegerDigits(value: number): boolean {
  return Math.abs(value) < 10 ** MAX_INTEGER_DIGITS;
}

function validMoney(value: number | null): boolean {
  if (value === null || value <= 0) {
    return false;
  }
  if (!hasValidIntegerDigits(value)) {
    return false;
  }
  const decimals = String(value).split('.')[1] ?? '';
  return decimals.length <= 2;
}

@Component({
  selector: 'app-funds',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Funds</h1>
          <p>Move money between your linked bank account and trading account.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/dashboard">Dashboard</a>
          <a class="tp-btn tp-btn-primary" routerLink="/orders/new">Place order</a>
        </div>
      </header>

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="funds-error"><span>{{ message }}</span></div>
      }
      @if (successMessage(); as message) {
        <div class="tp-alert tp-alert-success" role="status" data-testid="funds-success"><span>{{ message }}</span></div>
      }

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="funds-heading">
          <div class="tp-panel-header">
            <h2 id="funds-heading">Deposit or withdraw</h2>
            <p>Bank account linked</p>
          </div>

          <form class="tp-form tp-panel-body" [formGroup]="form" (ngSubmit)="onDeposit()">
            <div>
              <label class="tp-label" for="amount">Amount</label>
              <input
                class="tp-input tp-num"
                id="amount"
                data-testid="funds-amount"
                type="number"
                min="0.01"
                max="99999999999999.99"
                step="0.01"
                inputmode="decimal"
                formControlName="amount"
                aria-required="true"
                [attr.aria-invalid]="amountError() ? 'true' : null"
                [attr.aria-describedby]="amountError() ? 'amount-error' : 'amount-hint'"
              />
              @if (amountError(); as message) {
                <p class="tp-field-error" id="amount-error" data-testid="amount-error">{{ message }}</p>
              } @else {
                <p class="tp-hint" id="amount-hint">Enter a value with up to 2 decimal places.</p>
              }
            </div>

            <div class="tp-actions">
              <button class="tp-btn tp-btn-primary" data-testid="funds-deposit" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
                @if (isLoading()) {
                  <span class="tp-spinner" aria-hidden="true"></span>
                  Processing…
                } @else {
                  Deposit
                }
              </button>
              <button
                class="tp-btn tp-btn-secondary"
                type="button"
                data-testid="funds-withdraw"
                (click)="onWithdraw()"
                [attr.aria-disabled]="isLoading() ? 'true' : null"
              >
                Withdraw
              </button>
            </div>
            <span class="sr-only" role="status">{{ isLoading() ? 'Updating account balance, please wait.' : '' }}</span>
          </form>
        </section>

        <section class="tp-panel" aria-labelledby="summary-heading">
          <div class="tp-panel-header">
            <h2 id="summary-heading">Balance summary</h2>
          </div>
          <div class="tp-panel-body">
            <dl class="tp-details">
              <div><dt>Account</dt><dd class="tp-num" data-testid="funds-account">{{ accountId() || '—' }}</dd></div>
              <div><dt>Available cash</dt><dd class="tp-num" data-testid="funds-balance">{{ (balance() | currency: currency()) ?? '—' }}</dd></div>
              <div>
                <dt>Last update</dt>
                <dd>
                  @if (asOf(); as at) {
                    {{ at | date: 'MMM d, h:mm a' }}
                  } @else {
                    —
                  }
                </dd>
              </div>
            </dl>

            @if (previewBalance() !== null) {
              <div class="tp-stat">
                <p class="tp-stat-label">Balance after action</p>
                <p class="tp-stat-value" data-testid="funds-preview">{{ previewBalance() | currency: currency() }}</p>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .tp-stat { margin-top: 1rem; border-top: 1px solid var(--tp-border); padding-top: 1rem; }
  `]
})
export class FundsComponent implements OnInit {
  private readonly authService = inject(MockAuthService);
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = inject(NonNullableFormBuilder).group({
    amount: [null as number | null, Validators.required]
  });

  protected readonly accountId = computed(() => this.authService.currentUser$()?.accountId ?? 0);
  protected readonly balance = signal<number | null>(null);
  protected readonly currency = signal('USD');
  protected readonly asOf = signal('');
  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly previewBalance = computed(() => {
    const current = this.balance();
    const amount = this.form.controls.amount.value;
    return current !== null && amount !== null && validMoney(amount)
      ? Number((current + amount).toFixed(2))
      : null;
  });

  ngOnInit(): void {
    this.isLoading.set(true);
    this.tradeApi
      .getBalance()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.balance.set(response.cashBalance);
          this.currency.set(response.currency);
          this.asOf.set(response.asOf);
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

  protected amountError(): string | null {
    const amountControl = this.form.controls.amount;
    const amount = amountControl.value;
    if (!(amountControl.touched || this.submitted())) {
      return null;
    }
    if (amount === null) {
      return 'Enter an amount.';
    }
    if (amount <= 0) {
      return 'Amount must be greater than 0.';
    }
    if (!hasValidIntegerDigits(amount)) {
      return 'Amount can have at most 14 digits before the decimal point.';
    }
    if (!validMoney(amount)) {
      return 'Amount can have at most 2 decimal places.';
    }
    return null;
  }

  protected onDeposit(): void {
    this.updateBalance('deposit');
  }

  protected onWithdraw(): void {
    this.updateBalance('withdraw');
  }

  private updateBalance(action: 'deposit' | 'withdraw'): void {
    if (this.isLoading()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const amount = this.form.controls.amount.value;
    if (!validMoney(amount)) {
      this.host.nativeElement.querySelector<HTMLElement>('#amount')?.focus();
      return;
    }
    const safeAmount = amount as number;

    const current = this.balance();
    if (current === null) {
      this.errorMessage.set('Current balance is still loading.');
      return;
    }

    const updatedBalance = action === 'deposit'
      ? current + safeAmount
      : current - safeAmount;

    if (updatedBalance < 0) {
      this.errorMessage.set('Withdrawal amount exceeds your available cash balance.');
      return;
    }

    this.isLoading.set(true);

    this.tradeApi
      .updateBalance({ cashBalance: Number(updatedBalance.toFixed(2)) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.balance.set(response.cashBalance);
          this.currency.set(response.currency);
          this.asOf.set(response.asOf);
          this.successMessage.set(
            action === 'deposit'
              ? 'Funds deposited successfully.'
              : 'Funds withdrawn successfully.'
          );
          this.form.reset({ amount: null });
          this.submitted.set(false);
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
