import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MockAuthService } from '../../../shared/services/auth.service';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { OrderSide, PlaceOrderResponse, TradeApiError } from '../../../shared/models/order.models';

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
  const decimals = String(value).split('.')[1] ?? '';
  return decimals.length <= 2 ? null : { decimals: true };
}

@Component({
  selector: 'app-place-order',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe, DecimalPipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Place order</h1>
          <p>Submit a limit order to buy or sell an instrument.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/history">Order history</a>
        </div>
      </header>

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="ticket-heading">
          <div class="tp-panel-header">
            <h2 id="ticket-heading" #resultHeading tabindex="-1">
              {{ placedOrder() ? 'Order submitted' : 'Order ticket' }}
            </h2>
          </div>

          <div class="tp-panel-body">
            @if (placedOrder(); as order) {
              <div class="tp-form">
                <div class="tp-alert tp-alert-success" role="status" data-testid="order-result">
                  <span>{{ order.message || 'Your order has been submitted.' }}</span>
                </div>
                <dl class="tp-details">
                  <div><dt>Order ID</dt><dd class="tp-mono" data-testid="order-id">{{ order.orderId }}</dd></div>
                  <div><dt>Status</dt><dd><app-status-badge data-testid="order-status" [status]="order.status" /></dd></div>
                </dl>
                <div class="tp-actions">
                  <a class="tp-btn tp-btn-primary" routerLink="/orders/history" data-testid="order-view-orders">View orders</a>
                  <button class="tp-btn tp-btn-secondary" type="button" data-testid="order-place-another" (click)="resetForm()">Place another order</button>
                </div>
              </div>
            } @else {
              <form class="tp-form" [formGroup]="form" (ngSubmit)="onPlaceOrder()">
                @if (errorMessage(); as message) {
                  <div class="tp-alert tp-alert-error" role="alert" data-testid="order-error"><span>{{ message }}</span></div>
                }

                <fieldset class="tp-segmented">
                  <legend class="tp-label">Side</legend>
                  <div class="tp-segmented-options is-full">
                    <input
                      type="radio"
                      id="side-buy"
                      name="side"
                      value="BUY"
                      formControlName="side"
                      [attr.aria-describedby]="sideError() ? 'side-error' : null"
                    />
                    <label for="side-buy" class="is-buy" data-testid="order-side-buy">Buy</label>
                    <input
                      type="radio"
                      id="side-sell"
                      name="side"
                      value="SELL"
                      formControlName="side"
                      [attr.aria-describedby]="sideError() ? 'side-error' : null"
                    />
                    <label for="side-sell" class="is-sell" data-testid="order-side-sell">Sell</label>
                  </div>
                  @if (sideError(); as message) {
                    <p class="tp-field-error" id="side-error" data-testid="order-error-side">{{ message }}</p>
                  }
                </fieldset>

                <div>
                  <label class="tp-label" for="symbol">Symbol</label>
                  <input
                    class="tp-input symbol"
                    id="symbol"
                    data-testid="order-symbol"
                    type="text"
                    formControlName="symbol"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    aria-required="true"
                    [attr.aria-invalid]="symbolError() ? 'true' : null"
                    [attr.aria-describedby]="symbolError() ? 'symbol-error' : 'symbol-hint'"
                  />
                  @if (symbolError(); as message) {
                    <p class="tp-field-error" id="symbol-error" data-testid="order-error-symbol">{{ message }}</p>
                  } @else {
                    <p class="tp-hint" id="symbol-hint">For example AAPL, MSFT or GOOGL.</p>
                  }
                </div>

                <div class="tp-form-row">
                  <div>
                    <label class="tp-label" for="quantity">Quantity</label>
                    <input
                      class="tp-input tp-num"
                      id="quantity"
                      data-testid="order-quantity"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      formControlName="quantity"
                      aria-required="true"
                      [attr.aria-invalid]="quantityError() ? 'true' : null"
                      [attr.aria-describedby]="quantityError() ? 'quantity-error' : null"
                    />
                    @if (quantityError(); as message) {
                      <p class="tp-field-error" id="quantity-error" data-testid="order-error-quantity">{{ message }}</p>
                    }
                  </div>
                  <div>
                    <label class="tp-label" for="price">Limit price</label>
                    <input
                      class="tp-input tp-num"
                      id="price"
                      data-testid="order-price"
                      type="number"
                      inputmode="decimal"
                      min="0.01"
                      step="0.01"
                      formControlName="price"
                      aria-required="true"
                      [attr.aria-invalid]="priceError() ? 'true' : null"
                      [attr.aria-describedby]="priceError() ? 'price-error' : null"
                    />
                    @if (priceError(); as message) {
                      <p class="tp-field-error" id="price-error" data-testid="order-error-price">{{ message }}</p>
                    }
                  </div>
                </div>

                <button
                  class="tp-btn tp-btn-primary tp-btn-block"
                  data-testid="order-submit"
                  type="submit"
                  [attr.aria-disabled]="isLoading() ? 'true' : null"
                >
                  @if (isLoading()) {
                    <span class="tp-spinner" aria-hidden="true"></span>
                    Placing order…
                  } @else {
                    {{ submitLabel() }}
                  }
                </button>
                <span class="sr-only" role="status">{{ isLoading() ? 'Placing your order, please wait.' : '' }}</span>
              </form>
            }
          </div>
        </section>

        <section class="tp-panel" aria-labelledby="summary-heading">
          <div class="tp-panel-header">
            <h2 id="summary-heading">Summary</h2>
          </div>
          <div class="tp-panel-body">
            <dl class="tp-details">
              <div><dt>Account</dt><dd class="tp-num" data-testid="order-account">{{ accountId() || '—' }}</dd></div>
              <div><dt>Symbol</dt><dd data-testid="order-summary-symbol">{{ summarySymbol() || '—' }}</dd></div>
              <div>
                <dt>Side</dt>
                <dd data-testid="order-summary-side" [class.tp-positive]="values().side === 'BUY'" [class.tp-negative]="values().side === 'SELL'">
                  {{ values().side === 'BUY' ? 'Buy' : values().side === 'SELL' ? 'Sell' : '—' }}
                </dd>
              </div>
              <div><dt>Quantity</dt><dd class="tp-num" data-testid="order-summary-quantity">{{ (values().quantity | number) ?? '—' }}</dd></div>
              <div><dt>Limit price</dt><dd class="tp-num" data-testid="order-summary-price">{{ (values().price | currency) ?? '—' }}</dd></div>
            </dl>
            <div class="estimate">
              <p class="tp-stat-label">Estimated value</p>
              <p class="tp-stat-value" data-testid="order-estimate">{{ (estimate() | currency) ?? '—' }}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .symbol { text-transform: uppercase; }
    h2:focus-visible { outline: 2px solid var(--tp-focus); outline-offset: 4px; border-radius: 0.125rem; }
    .estimate { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--tp-border); }
  `]
})
export class PlaceOrderComponent implements OnInit {
  private readonly authService = inject(MockAuthService);
  private readonly orderService = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly resultHeading = viewChild.required<ElementRef<HTMLElement>>('resultHeading');

  protected readonly form = inject(NonNullableFormBuilder).group({
    side: ['' as OrderSide | '', Validators.required],
    symbol: ['', [Validators.required, Validators.maxLength(10)]],
    quantity: [null as number | null, [Validators.required, wholeNumber, positive]],
    price: [null as number | null, [Validators.required, positive, twoDecimals]]
  });

  protected readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly accountId = computed(() => this.authService.currentUser$()?.accountId ?? 0);
  protected readonly summarySymbol = computed(() => (this.values().symbol ?? '').trim().toUpperCase());
  protected readonly estimate = computed(() => {
    const { quantity, price } = this.values();
    return quantity && price && quantity > 0 && price > 0 ? quantity * price : null;
  });
  protected readonly submitLabel = computed(() => {
    const side = this.values().side;
    return side === 'BUY' ? 'Place buy order' : side === 'SELL' ? 'Place sell order' : 'Place order';
  });

  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly placedOrder = signal<PlaceOrderResponse | null>(null);

  // Kept across a retry of the same submission (see onPlaceOrder).
  private idempotencyKey = '';

  ngOnInit(): void {
    // Deep link from the watchlist (/orders/new?symbol=AAPL): fill the ticket
    // with that stock. The user's own typing always wins, so only a pristine
    // control is ever filled and validation still applies unchanged.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const symbol = (params.get('symbol') ?? '').trim().toUpperCase();
      const control = this.form.controls.symbol;
      if (symbol && control.pristine && control.value !== symbol) {
        control.setValue(symbol);
      }
    });
  }

  protected sideError(): string | null {
    return this.shows('side') ? 'Choose buy or sell.' : null;
  }

  protected symbolError(): string | null {
    if (!this.shows('symbol')) {
      return null;
    }
    return this.form.controls.symbol.hasError('required')
      ? 'Enter a symbol.'
      : 'Symbols are at most 10 characters.';
  }

  protected quantityError(): string | null {
    if (!this.shows('quantity')) {
      return null;
    }
    return this.form.controls.quantity.hasError('required')
      ? 'Enter a quantity.'
      : 'Quantity must be a whole number greater than 0.';
  }

  protected priceError(): string | null {
    if (!this.shows('price')) {
      return null;
    }
    const control = this.form.controls.price;
    if (control.hasError('required')) {
      return 'Enter a price.';
    }
    return control.hasError('positive')
      ? 'Price must be greater than 0.'
      : 'Price can have at most 2 decimal places.';
  }

  protected onPlaceOrder(): void {
    if (this.isLoading()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }

    // accountId is 0 until the trading account has been provisioned and the
    // user has signed in again to pick it up in a fresh token.
    const accountId = this.accountId();
    if (!accountId) {
      this.errorMessage.set(this.errorMapping.getErrorMessage('ACC-404'));
      return;
    }

    // Generate idempotencyKey (unique identifier for order idempotency)
    if (!this.idempotencyKey) {
      this.idempotencyKey = crypto.randomUUID();
    }

    const { side, symbol, quantity, price } = this.form.getRawValue();
    this.isLoading.set(true);

    this.orderService
      .placeOrder({
        accountId,
        symbol: symbol.trim().toUpperCase(),
        side: side as OrderSide,
        quantity: quantity ?? 0,
        price: price ?? 0,
        idempotencyKey: this.idempotencyKey
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          this.idempotencyKey = '';
          this.placedOrder.set(response);
          afterNextRender(() => this.resultHeading().nativeElement.focus(), { injector: this.injector });
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          if (this.errorMapping.isNetworkError(err.status)) {
            // No answer from the backend, so the order may or may not have
            // been recorded. The key is kept so that pressing submit again
            // retries the same order instead of placing a second one.
            this.errorMessage.set(this.errorMapping.getNetworkErrorMessage());
            return;
          }
          // The backend answered, so this attempt is settled; a corrected
          // resubmission is a new order and needs a new key.
          this.idempotencyKey = '';
          this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
        }
      });
  }

  protected resetForm(): void {
    this.form.reset();
    this.submitted.set(false);
    this.errorMessage.set('');
    this.placedOrder.set(null);
    this.idempotencyKey = '';
    // The button that was pressed has been replaced by the empty ticket.
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#side-buy')?.focus(), {
      injector: this.injector
    });
  }

  private shows(name: 'side' | 'symbol' | 'quantity' | 'price'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }
}
