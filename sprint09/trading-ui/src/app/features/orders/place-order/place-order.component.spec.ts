import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PlaceOrderComponent } from './place-order.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { PlaceOrderRequest } from '../../../shared/models/order.models';

describe('PlaceOrderComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<PlaceOrderComponent>;
  let page: HTMLElement;

  const el = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const sentOrder = (call = 0) => tradeApi.placeOrder.calls.argsFor(call)[0] as PlaceOrderRequest;

  function type(id: string, value: string): void {
    const input = el<HTMLInputElement>(`#${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function fillValidOrder(): void {
    el<HTMLInputElement>('#side-buy').click();
    type('symbol', ' aapl ');
    type('quantity', '10');
    type('price', '150.25');
    fixture.detectChanges();
  }

  function submit(): void {
    el('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['placeOrder']);
    tradeApi.placeOrder.and.returnValue(
      of({ orderId: 'ORD-1', status: 'NEW', message: 'Order accepted', symbol: 'AAPL', side: 'BUY', quantity: 10, price: 150.25 })
    );

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        {
          provide: MockAuthService,
          useValue: { currentUser$: signal({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] }) }
        }
      ]
    });
    fixture = TestBed.createComponent(PlaceOrderComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('reports every missing field on submit without calling the API', () => {
    submit();

    expect(tradeApi.placeOrder).not.toHaveBeenCalled();
    expect(el('#side-error').textContent).toContain('Choose buy or sell.');
    expect(el('#symbol-error').textContent).toContain('Enter a symbol.');
    expect(el('#quantity-error').textContent).toContain('Enter a quantity.');
    expect(el('#price-error').textContent).toContain('Enter a price.');
    expect(document.activeElement).toBe(el('#side-buy'));
  });

  it('rejects fractional quantities and prices with more than two decimals', () => {
    el<HTMLInputElement>('#side-sell').click();
    type('symbol', 'MSFT');
    type('quantity', '1.5');
    type('price', '10.123');
    submit();

    expect(tradeApi.placeOrder).not.toHaveBeenCalled();
    expect(el('#quantity-error').textContent).toContain('whole number');
    expect(el('#price-error').textContent).toContain('at most 2 decimal places');
  });

  it('summarises the order and its estimated value as it is filled in', () => {
    fillValidOrder();

    const summary = el('[aria-labelledby="summary-heading"]').textContent ?? '';
    expect(summary).toContain('AAPL');
    expect(summary).toContain('Buy');
    expect(summary).toContain('$1,502.50');
    expect(el('button[type="submit"]').textContent).toContain('Place buy order');
  });

  it('sends the order for the signed-in account with a fresh idempotency key', async () => {
    fillValidOrder();
    submit();
    await fixture.whenStable();

    const order = sentOrder();
    expect(order).toEqual(
      jasmine.objectContaining({ accountId: 6, symbol: 'AAPL', side: 'BUY', quantity: 10, price: 150.25 })
    );
    expect(order.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(el('h2').textContent).toContain('Order submitted');
    expect(document.activeElement).toBe(el('h2'));
    expect(page.textContent).toContain('ORD-1');
  });

  it('retries with the same key when the backend could not be reached', () => {
    tradeApi.placeOrder.and.returnValue(throwError(() => ({ errorCode: '', message: '', status: 0 })));
    fillValidOrder();
    submit();
    submit();

    expect(el('[role="alert"]').textContent).toContain('Unable to connect');
    expect(sentOrder(1).idempotencyKey).toBe(sentOrder(0).idempotencyKey);
  });

  it('uses a new key after the backend has answered with an error', () => {
    tradeApi.placeOrder.and.returnValue(throwError(() => ({ errorCode: 'ORD-400', message: '', status: 400 })));
    fillValidOrder();
    submit();
    submit();

    expect(el('[role="alert"]').textContent).toContain('not enough cash');
    expect(sentOrder(1).idempotencyKey).not.toBe(sentOrder(0).idempotencyKey);
  });

  it('starts a clean ticket from "Place another order"', () => {
    fillValidOrder();
    submit();

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Place another order'))!.click();
    fixture.detectChanges();

    expect(el<HTMLInputElement>('#symbol').value).toBe('');
    expect(el('#side-error' as string)).toBeNull();
  });
});
