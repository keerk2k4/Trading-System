import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { OrderSide, StrategyPreference, TradeApiError } from '../../shared/models/order.models';

function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { wholeNumber: true };
}

function positive(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || value > 0 ? null : { positive: true };
}

function twoDecimals(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  if (value === null) {
    return null;
  }
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6 ? null : { twoDecimals: true };
}

/**
 * Quote-triggered strategies: the customer sets a target price, and the
 * backend submits a MARKET order the first time a live quote reaches it
 * (BUY when the ask is at or below target, SELL when the bid is at or above).
 * ACTIVE strategies can be cancelled here; TRIGGERED and CANCELLED are final.
 */
@Component({
  selector: 'app-strategies',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DatePipe, DecimalPipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Strategies</h1>
          <p>Set a target price and a market order is placed automatically when the live quote reaches it.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary"
            type="button"
            data-testid="strategies-refresh"
            [attr.aria-disabled]="isLoading() ? 'true' : null"
            (click)="refresh()"
          >
            {{ isLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/new">Place order</a>
        </div>
      </header>

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="strategy-list-heading" [attr.aria-busy]="isLoading()">
          <div class="tp-panel-header">
            <div>
              <h2 id="strategy-list-heading">My strategies</h2>
              <p class="tp-num" role="status" data-testid="strategies-count">
                {{ isLoading() ? 'Loading strategies…' : activeCount() + ' active of ' + strategies().length }}
              </p>
            </div>
          </div>

          @if (listError(); as message) {
            <div class="tp-panel-body">
              <div class="tp-alert tp-alert-error" role="alert" data-testid="strategies-error"><span>{{ message }}</span></div>
            </div>
          }

          @if (strategies().length === 0) {
            @if (!isLoading() && !listError()) {
              <div class="tp-empty" data-testid="strategies-empty">
                <strong>No strategies yet</strong>
                Use the form to set your first target price.
              </div>
            }
          } @else {
            <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Strategies table">
              <table class="tp-table">
                <thead>
                  <tr>
                    <th scope="col">Created</th>
                    <th scope="col">Symbol</th>
                    <th scope="col">Side</th>
                    <th scope="col" class="num">Quantity</th>
                    <th scope="col" class="num">Target price</th>
                    <th scope="col">Status</th>
                    <th scope="col">Order</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (strategy of strategies(); track strategy.strategyId) {
                    <tr data-testid="strategy-row" [attr.data-strategy-id]="strategy.strategyId">
                      <td class="tp-muted">{{ strategy.createdOn | date: 'MMM d, y, h:mm a' }}</td>
                      <td><strong>{{ strategy.symbol }}</strong></td>
                      <td>
                        <span [class.tp-positive]="strategy.side === 'BUY'" [class.tp-negative]="strategy.side === 'SELL'">
                          <strong>{{ strategy.side === 'BUY' ? 'Buy' : 'Sell' }}</strong>
                        </span>
                      </td>
                      <td class="num">{{ strategy.quantity | number }}</td>
                      <td class="num">{{ strategy.targetPrice | currency }}</td>
                      <td><app-status-badge data-testid="strategy-status" [status]="strategy.status" /></td>
                      <td>
                        @if (strategy.triggeredOrderId) {
                          <span class="tp-mono" data-testid="strategy-order-id">{{ strategy.triggeredOrderId }}</span>
                          @if (strategy.triggeredOn) {
                            <span class="tp-muted"> · {{ strategy.triggeredOn | date: 'MMM d, h:mm a' }}</span>
                          }
                        } @else {
                          <span class="tp-muted">—</span>
                        }
                      </td>
                      <td>
                        @if (strategy.status === 'ACTIVE') {
                          <button
                            class="tp-btn tp-btn-secondary"
                            type="button"
                            data-testid="strategy-cancel"
                            [attr.aria-disabled]="cancellingId() !== null ? 'true' : null"
                            [attr.aria-label]="'Cancel ' + strategy.side.toLowerCase() + ' strategy for ' + strategy.symbol"
                            (click)="cancel(strategy)"
                          >
                            {{ cancellingId() === strategy.strategyId ? 'Cancelling…' : 'Cancel' }}
                          </button>
                        } @else {
                          <span class="tp-muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <section class="tp-panel" aria-labelledby="strategy-form-heading">
          <div class="tp-panel-header">
            <h2 id="strategy-form-heading">Add strategy</h2>
          </div>
          <div class="tp-panel-body">
            <form class="tp-form" [formGroup]="form" (ngSubmit)="create()">
              @if (formError(); as message) {
                <div class="tp-alert tp-alert-error" role="alert" data-testid="strategy-form-error"><span>{{ message }}</span></div>
              }
              @if (successMessage(); as message) {
                <div class="tp-alert tp-alert-success" role="status" data-testid="strategy-created"><span>{{ message }}</span></div>
              }

              <fieldset class="tp-segmented">
                <legend class="tp-label">Side</legend>
                <div class="tp-segmented-options is-full">
                  <input type="radio" id="strategy-side-buy" name="side" value="BUY" formControlName="side" />
                  <label for="strategy-side-buy" class="is-buy" data-testid="strategy-side-buy">Buy</label>
                  <input type="radio" id="strategy-side-sell" name="side" value="SELL" formControlName="side" />
                  <label for="strategy-side-sell" class="is-sell" data-testid="strategy-side-sell">Sell</label>
                </div>
              </fieldset>

              <div>
                <label class="tp-label" for="strategy-symbol">Symbol</label>
                <input
                  class="tp-input"
                  id="strategy-symbol"
                  data-testid="strategy-symbol"
                  type="text"
                  formControlName="symbol"
                  autocomplete="off"
                  autocapitalize="characters"
                  spellcheck="false"
                  aria-required="true"
                  [attr.aria-invalid]="symbolError() ? 'true' : null"
                  [attr.aria-describedby]="symbolError() ? 'strategy-symbol-error' : null"
                />
                @if (symbolError(); as message) {
                  <p class="tp-field-error" id="strategy-symbol-error" data-testid="strategy-error-symbol">{{ message }}</p>
                }
              </div>

              <div class="tp-form-row">
                <div>
                  <label class="tp-label" for="strategy-quantity">Quantity</label>
                  <input
                    class="tp-input tp-num"
                    id="strategy-quantity"
                    data-testid="strategy-quantity"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="1"
                    formControlName="quantity"
                    aria-required="true"
                    [attr.aria-invalid]="quantityError() ? 'true' : null"
                    [attr.aria-describedby]="quantityError() ? 'strategy-quantity-error' : null"
                  />
                  @if (quantityError(); as message) {
                    <p class="tp-field-error" id="strategy-quantity-error" data-testid="strategy-error-quantity">{{ message }}</p>
                  }
                </div>
                <div>
                  <label class="tp-label" for="strategy-target">Target price</label>
                  <input
                    class="tp-input tp-num"
                    id="strategy-target"
                    data-testid="strategy-target"
                    type="number"
                    inputmode="decimal"
                    min="0.01"
                    step="0.01"
                    formControlName="targetPrice"
                    aria-required="true"
                    [attr.aria-invalid]="targetError() ? 'true' : null"
                    [attr.aria-describedby]="targetError() ? 'strategy-target-error' : null"
                  />
                  @if (targetError(); as message) {
                    <p class="tp-field-error" id="strategy-target-error" data-testid="strategy-error-target">{{ message }}</p>
                  }
                </div>
              </div>

              <p class="tp-hint" data-testid="strategy-trigger-hint">
                @if (values().side === 'SELL') {
                  A market sell order is placed when the bid price rises to or above your target.
                } @else {
                  A market buy order is placed when the ask price falls to or below your target.
                }
              </p>

              <button
                class="tp-btn tp-btn-primary tp-btn-block"
                data-testid="strategy-submit"
                type="submit"
                [attr.aria-disabled]="isSaving() ? 'true' : null"
              >
                @if (isSaving()) {
                  <span class="tp-spinner" aria-hidden="true"></span>
                  Saving strategy…
                } @else {
                  Add strategy
                }
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  `
})
export class StrategiesComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly strategies = signal<StrategyPreference[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly cancellingId = signal<number | null>(null);
  protected readonly listError = signal('');
  protected readonly formError = signal('');
  protected readonly successMessage = signal('');
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    side: this.fb.control<OrderSide>('BUY', Validators.required),
    symbol: this.fb.control('', [Validators.required, Validators.maxLength(20)]),
    quantity: this.fb.control<number | null>(1, [Validators.required, wholeNumber, positive]),
    targetPrice: this.fb.control<number | null>(null, [Validators.required, positive, twoDecimals])
  });

  protected readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected readonly activeCount = computed(
    () => this.strategies().filter((s) => s.status === 'ACTIVE' || s.status === 'TRIGGERING').length
  );

  protected readonly symbolError = computed(() => {
    this.values();
    this.status();
    const control = this.form.controls.symbol;
    if (!this.submitted() && !control.touched) return '';
    if (control.hasError('required') || !control.value.trim()) return 'Enter a symbol.';
    if (control.hasError('maxlength')) return 'Symbols are at most 20 characters.';
    return '';
  });

  protected readonly quantityError = computed(() => {
    this.values();
    this.status();
    const control = this.form.controls.quantity;
    if (!this.submitted() && !control.touched) return '';
    if (control.hasError('required')) return 'Enter a quantity.';
    if (control.hasError('wholeNumber')) return 'Quantity must be a whole number.';
    if (control.hasError('positive')) return 'Quantity must be at least 1.';
    return '';
  });

  protected readonly targetError = computed(() => {
    this.values();
    this.status();
    const control = this.form.controls.targetPrice;
    if (!this.submitted() && !control.touched) return '';
    if (control.hasError('required')) return 'Enter a target price.';
    if (control.hasError('positive')) return 'Target price must be greater than zero.';
    if (control.hasError('twoDecimals')) return 'Use at most two decimal places.';
    return '';
  });

  ngOnInit(): void {
    // Place order links here with the symbol it was working on, if any.
    const symbol = this.route.snapshot.queryParamMap.get('symbol');
    if (symbol) {
      this.form.controls.symbol.setValue(symbol.trim().toUpperCase());
    }
    this.load();
  }

  protected refresh(): void {
    if (!this.isLoading()) {
      this.listError.set('');
      this.load();
    }
  }

  protected create(): void {
    if (this.isSaving()) return;
    this.submitted.set(true);
    this.formError.set('');
    this.successMessage.set('');
    const symbol = this.form.controls.symbol.value.trim().toUpperCase();
    if (this.form.invalid || !symbol) {
      this.form.markAllAsTouched();
      return;
    }

    const { side, quantity, targetPrice } = this.form.getRawValue();
    this.isSaving.set(true);
    this.tradeApi
      .createStrategy({ symbol, side, quantity: quantity!, targetPrice: targetPrice! })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.isSaving.set(false);
          this.strategies.update((list) => [created, ...list]);
          this.successMessage.set(
            `Strategy added: ${created.side === 'BUY' ? 'buy' : 'sell'} ${created.quantity} ${created.symbol} at ${created.targetPrice.toFixed(2)}.`
          );
          this.submitted.set(false);
          this.form.reset({ side, symbol: '', quantity: 1, targetPrice: null });
        },
        error: (err: TradeApiError) => {
          this.isSaving.set(false);
          this.formError.set(this.messageFor(err));
        }
      });
  }

  protected cancel(strategy: StrategyPreference): void {
    if (this.cancellingId() !== null) return;
    this.cancellingId.set(strategy.strategyId);
    this.listError.set('');
    this.tradeApi
      .cancelStrategy(strategy.strategyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancellingId.set(null);
          this.strategies.update((list) =>
            list.map((s) => (s.strategyId === strategy.strategyId ? { ...s, status: 'CANCELLED' } : s))
          );
        },
        error: (err: TradeApiError) => {
          this.cancellingId.set(null);
          this.listError.set(this.messageFor(err));
          // The strategy may have triggered in the meantime; show the real state.
          this.load();
        }
      });
  }

  private load(): void {
    this.isLoading.set(true);
    this.tradeApi
      .getStrategies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (strategies) => {
          this.strategies.set(
            [...strategies].sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime())
          );
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.listError.set(this.messageFor(err));
        }
      });
  }

  private messageFor(err: TradeApiError): string {
    return this.errorMapping.isNetworkError(err.status)
      ? this.errorMapping.getNetworkErrorMessage()
      : this.errorMapping.getErrorMessage(err.errorCode);
  }
}
