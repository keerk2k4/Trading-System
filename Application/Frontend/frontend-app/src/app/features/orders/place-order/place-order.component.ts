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
import { WatchlistService } from '../../../shared/services/watchlist.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { AccountStatusNoticeComponent } from '../../../shared/ui/account-status-notice.component';
import { CandlestickChartComponent } from '../../../shared/ui/candlestick-chart.component';
import { OrderSide, OrderType, PlaceOrderResponse, TradeApiError } from '../../../shared/models/order.models';
import { OrderSide, OrderType, PlaceOrderResponse, Quote, TradeApiError } from '../../../shared/models/order.models';
import { WatchlistStock } from '../../../shared/models/watchlist.models';

/** Results shown under the symbol field; the full list belongs on the watchlist page. */
const MAX_SEARCH_RESULTS = 6;

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
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    DecimalPipe,
    StatusBadgeComponent,
    AccountStatusNoticeComponent,
    CandlestickChartComponent
  ],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Place order</h1>
          <p>Submit a limit or market order to buy or sell an instrument.</p>
          <p>Submit a limit or market order to buy or sell an instrument.</p>
        </div>
        <div class="tp-actions">
          <a class="tp-btn tp-btn-secondary" routerLink="/orders/history">Order history</a>
        </div>
      </header>

      <app-account-status-notice [status]="accountStatus()" />

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
                  <legend class="tp-label">Order type</legend>
                  <div class="tp-segmented-options is-full">
                    <input type="radio" id="type-limit" name="orderType" value="LIMIT" formControlName="orderType" />
                    <label for="type-limit" data-testid="order-type-limit">Limit</label>
                    <input type="radio" id="type-market" name="orderType" value="MARKET" formControlName="orderType" />
                    <label for="type-market" data-testid="order-type-market">Market</label>
                  </div>
                </fieldset>

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
                    <p class="tp-hint" id="symbol-hint">Search by company name or symbol, for example Apple or AAPL.</p>
                  }

                  <span class="sr-only" role="status" data-testid="order-search-status">{{ searchStatus() }}</span>
                  @if (showSearch()) {
                    <div class="results" role="region" aria-label="Matching stocks">
                      @if (searchResults().length === 0) {
                        <p class="tp-muted" data-testid="order-search-empty">No stocks match “{{ (values().symbol ?? '').trim() }}”.</p>
                      } @else {
                        <ul class="result-list">
                          @for (stock of searchResults(); track stock.symbol) {
                            <li class="result-row" data-testid="order-search-row">
                              <div class="identity">
                                <strong>{{ stock.symbol }}</strong>
                                <span class="tp-muted">{{ stock.companyName }}</span>
                              </div>
                              <span class="tp-num">{{ stock.price | currency }}</span>
                              <button
                                class="tp-btn tp-btn-secondary"
                                type="button"
                                data-testid="order-search-select"
                                [attr.data-symbol]="stock.symbol"
                                [attr.aria-label]="'Select ' + stock.symbol + ', ' + stock.companyName"
                                (click)="selectStock(stock)"
                              >
                                Select
                              </button>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  }

                  @if (chartSymbol(); as chart) {
                    <app-candlestick-chart [symbol]="chart" />
                  }
                </div>

                <fieldset class="tp-segmented">
                  <legend class="tp-label">Order type</legend>
                  <div class="tp-segmented-options is-full">
                    <input
                      type="radio"
                      id="type-limit"
                      name="orderType"
                      value="LIMIT"
                      formControlName="orderType"
                      data-testid="order-type-limit-input"
                      (change)="onOrderTypeChange('LIMIT')"
                    />
                    <label for="type-limit" data-testid="order-type-limit">Limit</label>
                    <input
                      type="radio"
                      id="type-market"
                      name="orderType"
                      value="MARKET"
                      formControlName="orderType"
                      data-testid="order-type-market-input"
                      (change)="onOrderTypeChange('MARKET')"
                    />
                    <label for="type-market" data-testid="order-type-market">Market</label>
                  </div>
                  <p class="tp-hint" id="type-hint">
                    @if (isMarket()) {
                      Market orders fill immediately at the live price and cannot be cancelled or updated.
                    } @else {
                      Limit orders wait about 15 seconds before filling, so they can be cancelled or updated.
                    }
                  </p>
                </fieldset>

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
                  @if (isMarket()) {
                    <div>
                      <span class="tp-label">Market price</span>
                      <p class="tp-stat-value" data-testid="order-market-price">
                        @if (marketPrice() !== null) {
                          {{ marketPrice() | currency }}
                        } @else {
                          —
                        }
                      </p>
                      @if (quoteStatus(); as qs) {
                        <p class="tp-hint" data-testid="order-quote-status">{{ qs }}</p>
                      }
                    </div>
                  } @else {
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
                  }
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
              <div><dt>Order type</dt><dd data-testid="order-summary-type">{{ values().orderType === 'MARKET' ? 'Market' : 'Limit' }}</dd></div>
              <div><dt>Quantity</dt><dd class="tp-num" data-testid="order-summary-quantity">{{ (values().quantity | number) ?? '—' }}</dd></div>
              @if (isMarket()) {
                <div><dt>Market price</dt><dd class="tp-num" data-testid="order-summary-market-price">{{ (marketPrice() | currency) ?? '—' }}</dd></div>
              } @else {
                <div><dt>Limit price</dt><dd class="tp-num" data-testid="order-summary-price">{{ (values().price | currency) ?? '—' }}</dd></div>
              }
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
    .results { margin-top: 0.5rem; }
    .result-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .result-row {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem;
      border: 1px solid var(--tp-border); border-radius: var(--tp-radius); background-color: var(--tp-surface-raised);
    }
    .identity { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .identity span { font-size: 0.8125rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `]
})
export class PlaceOrderComponent implements OnInit {
  private readonly authService = inject(MockAuthService);
  private readonly orderService = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly watchlist = inject(WatchlistService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly resultHeading = viewChild.required<ElementRef<HTMLElement>>('resultHeading');

  protected readonly form = inject(NonNullableFormBuilder).group({
    orderType: ['LIMIT' as OrderType, Validators.required],
    side: ['' as OrderSide | '', Validators.required],
    orderType: ['LIMIT' as OrderType, Validators.required],
    symbol: ['', [Validators.required, Validators.maxLength(10)]],
    quantity: [null as number | null, [Validators.required, wholeNumber, positive]],
    price: [null as number | null, [positive, twoDecimals]]
  });

  protected readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly isMarket = computed(() => this.values().orderType === 'MARKET');
  // Latest live quote for the symbol on a MARKET ticket, loaded immediately
  // when the trader picks MARKET or a stock. Null until the first quote arrives.
  protected readonly marketQuote = signal<Quote | null>(null);
  protected readonly quoteStatus = signal('');
  protected readonly marketPrice = computed(() => {
    const quote = this.marketQuote();
    if (!quote) {
      return null;
    }
    const side = this.values().side;
    if (side === 'BUY' && quote.ask != null) {
      return quote.ask;
    }
    if (side === 'SELL' && quote.bid != null) {
      return quote.bid;
    }
    return quote.price ?? null;
  });
  protected readonly accountId = computed(() => this.authService.currentUser$()?.accountId ?? 0);
  protected readonly summarySymbol = computed(() => (this.values().symbol ?? '').trim().toUpperCase());
  protected readonly estimate = computed(() => {
    const { orderType, quantity } = this.values();
    if (orderType === 'MARKET') {
      return null;
    }
    const unit = this.isMarket() ? this.marketPrice() : this.values().price;
    return quantity && unit && quantity > 0 && unit > 0 ? quantity * unit : null;
  });
  protected readonly submitLabel = computed(() => {
    const side = this.values().side;
    const kind = this.isMarket() ? 'market' : 'limit';
    if (side === 'BUY') {
      return `Place ${kind} buy order`;
    }
    if (side === 'SELL') {
      return `Place ${kind} sell order`;
    }
    return 'Place order';
  });

  // The symbol last chosen from the results (or deep-linked). While the field
  // still holds it, the results stay hidden; typing anything else reopens them.
  private readonly pickedSymbol = signal('');
  protected readonly showSearch = computed(() => {
    const query = (this.values().symbol ?? '').trim();
    return query !== '' && query.toUpperCase() !== this.pickedSymbol();
  });
  // The chart follows the selected instrument and disappears once the trader
  // types something else into the field.
  protected readonly chartSymbol = computed(() => {
    const picked = this.pickedSymbol();
    return picked && this.summarySymbol() === picked ? picked : '';
  });
  // Same name-or-symbol filter as the watchlist page, over the same catalog.
  protected readonly searchResults = computed(() =>
    this.showSearch() ? this.watchlist.search(this.values().symbol ?? '').slice(0, MAX_SEARCH_RESULTS) : []
  );
  // Text typed to search ("apple") that matches stocks but is not itself one of
  // their symbols. Submitting it would only come back as INS-404, so the trader
  // is asked to pick from the list. Text matching nothing (or an empty catalog)
  // is still left to the server, which stays the authority on instruments.
  protected readonly needsPick = computed(() => {
    if (!this.showSearch()) {
      return false;
    }
    const query = (this.values().symbol ?? '').trim().toUpperCase();
    const matches = this.watchlist.search(query);
    return matches.length > 0 && !matches.some((stock) => stock.symbol === query);
  });
  // Read by screen readers, which cannot see the result list appear.
  protected readonly searchStatus = computed(() => {
    if (!this.showSearch()) {
      return '';
    }
    const count = this.searchResults().length;
    return count === 0 ? 'No stocks match.' : `${count} ${count === 1 ? 'stock matches' : 'stocks match'}.`;
  });

  // Only for the suspended notice; the ticket itself works the same for every
  // status and the Trade API decides whether the order is accepted.
  protected readonly accountStatus = signal<string | null>(null);

  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly placedOrder = signal<PlaceOrderResponse | null>(null);

  // Kept across a retry of the same submission (see onPlaceOrder).
  private idempotencyKey = '';

  ngOnInit(): void {
    this.watchlist.loadCatalog();
    this.applyPriceValidators(this.form.controls.orderType.value);
    this.form.controls.orderType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.applyPriceValidators(type);
        if (type === 'MARKET') {
          this.loadQuote(this.summarySymbol());
        } else {
          this.marketQuote.set(null);
          this.quoteStatus.set('');
        }
      });
    // When the symbol changes on a MARKET ticket, reload the current value immediately.
    this.form.controls.symbol.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isMarket()) {
          this.loadQuote(this.summarySymbol());
        }
      });
    this.orderService
      .getAccount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (account) => this.accountStatus.set(account.status), error: () => undefined });

    // Deep link from the watchlist (/orders/new?symbol=AAPL): fill the ticket
    // with that stock. The user's own typing always wins, so only a pristine
    // control is ever filled and validation still applies unchanged.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const symbol = (params.get('symbol') ?? '').trim().toUpperCase();
      const control = this.form.controls.symbol;
      if (symbol && control.pristine && control.value !== symbol) {
        control.setValue(symbol);
        this.pickedSymbol.set(symbol);
      }
    });
  }

  /**
   * Fills the ticket from a search result: the symbol always; the price from the
   * live quote for a LIMIT ticket only when the trader has not typed one yet,
   * and as the current market value for a MARKET ticket.
   * Focus moves on to quantity because the pressed button disappears.
   */
  protected selectStock(stock: WatchlistStock): void {
    const { symbol, price, orderType } = this.form.controls;
    symbol.setValue(stock.symbol);
    symbol.markAsDirty();
    this.pickedSymbol.set(stock.symbol);
    if (this.isMarket()) {
      this.loadQuote(stock.symbol);
    } else if (orderType.value === 'LIMIT' && price.value === null && stock.price > 0) {
      price.setValue(Math.round(stock.price * 100) / 100);
      price.markAsDirty();
    }
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#quantity')?.focus(), {
      injector: this.injector
    });
  }

  /** Switching between LIMIT and MARKET re-validates the price field. */
  protected onOrderTypeChange(type: OrderType): void {
    this.form.controls.orderType.setValue(type);
  }

  private applyPriceValidators(type: OrderType): void {
    const price = this.form.controls.price;
    if (type === 'MARKET') {
      price.clearValidators();
    } else {
      price.setValidators([Validators.required, positive, twoDecimals]);
    }
    price.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Loads the current market value for the symbol into the MARKET ticket, so the
   * trader sees what the order will execute against. Falls back to the catalog
   * price when the quote cache has nothing yet.
   */
  private loadQuote(symbol: string): void {
    const key = (symbol ?? '').trim().toUpperCase();
    if (!key) {
      this.marketQuote.set(null);
      this.quoteStatus.set('');
      return;
    }
    const catalogPrice = this.watchlist.search(key).find((stock) => stock.symbol === key)?.price ?? null;
    this.quoteStatus.set('Loading live price…');
    this.orderService.getQuote(key).subscribe({
      next: (quote) => {
        this.marketQuote.set(quote);
        this.quoteStatus.set('');
      },
      error: () => {
        // No cached quote yet: fall back to the catalog price so the ticket
        // still shows a value; the server rejects the order without a quote.
        this.marketQuote.set(
          catalogPrice !== null
            ? { symbol: key, price: catalogPrice, bid: null, ask: null }
            : null
        );
        this.quoteStatus.set(
          catalogPrice !== null ? 'Showing last catalog price; live quote unavailable.' : 'No live price yet for this symbol.'
        );
      }
    });
  }

  protected sideError(): string | null {
    return this.shows('side') ? 'Choose buy or sell.' : null;
  }

  protected symbolError(): string | null {
    const control = this.form.controls.symbol;
    const needsPick = this.needsPick();
    if (!(control.touched || this.submitted()) || (control.valid && !needsPick)) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a symbol.';
    }
    // Mid-search ("Microsoft Corp"), the length rule is not the problem;
    // say nothing until submit, then point at the list.
    if (needsPick) {
      return this.submitted() ? 'Choose a stock from the list below.' : null;
    }
    return 'Symbols are at most 10 characters.';
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
    if (this.values().orderType === 'MARKET') {
      return null;
    }
    if (this.isMarket()) {
      return null;
    }
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

    if (this.form.invalid || this.needsPick()) {
      const page = this.host.nativeElement;
      (page.querySelector<HTMLElement>('input.ng-invalid') ?? page.querySelector<HTMLElement>('#symbol'))?.focus();
      return;
    }

    // accountId is 0 until the trading account has been provisioned and the
    // user has signed in again to pick it up in a fresh token.
    // Generate idempotencyKey (unique identifier for order idempotency)
    if (!this.idempotencyKey) {
      this.idempotencyKey = crypto.randomUUID();
    }

    const { orderType, side, symbol, quantity, price } = this.form.getRawValue();
    const { side, orderType, symbol, quantity, price } = this.form.getRawValue();
    this.isLoading.set(true);

    const request = {
      orderType,
      symbol: symbol.trim().toUpperCase(),
      side: side as OrderSide,
      quantity: quantity ?? 0,
      idempotencyKey: this.idempotencyKey
    } as {
      orderType: OrderType;
      symbol: string;
      side: OrderSide;
      quantity: number;
      idempotencyKey: string;
      price?: number;
    };
    if (orderType === 'LIMIT') {
      request.price = price ?? 0;
    }

    this.orderService
      .placeOrder(request)
    this.orderService
      .placeOrder({
        accountId,
        orderType: orderType as OrderType,
        symbol: symbol.trim().toUpperCase(),
        side: side as OrderSide,
        quantity: quantity ?? 0,
        ...(orderType === 'MARKET' ? {} : { price: price ?? 0 }),
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
    this.form.controls.orderType.setValue('LIMIT');
    this.marketQuote.set(null);
    this.quoteStatus.set('');
    this.submitted.set(false);
    this.errorMessage.set('');
    this.placedOrder.set(null);
    this.idempotencyKey = '';
    this.pickedSymbol.set('');
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
