import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ViewOrdersComponent } from './view-orders.component';
import { TradeApiService } from '../../../shared/services/trade-api.service';
import { Order } from '../../../shared/models/order.models';

function order(orderId: string, createdOn: string, extra: Partial<Order> = {}): Order {
  return {
    orderId,
    accountId: 6,
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 10,
    price: 150,
    executedPrice: null,
    status: 'NEW',
    idempotencyKey: `key-${orderId}`,
    createdOn,
    ...extra
  };
}

describe('ViewOrdersComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<ViewOrdersComponent>;
  let page: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi }
      ]
    });
    fixture = TestBed.createComponent(ViewOrdersComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  const rows = () => Array.from(page.querySelectorAll('tbody tr'));

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getOrders']);
    tradeApi.getOrders.and.returnValue(
      of([
        order('ORD-OLD', '2026-01-01T10:00:00Z'),
        order('ORD-NEW', '2026-02-01T10:00:00Z', { side: 'SELL', status: 'FILLED', executedPrice: 151.5 })
      ])
    );
  });

  it('lists orders newest first with side, fill price and status in words', () => {
    create();

    expect(tradeApi.getOrders).toHaveBeenCalledWith({ status: undefined });
    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('ORD-NEW');
    expect(rows()[0].textContent).toContain('Sell');
    expect(rows()[0].textContent).toContain('$151.50');
    expect(rows()[0].textContent).toContain('Filled');
    expect(rows()[1].textContent).toContain('—');
  });

  it('reloads with the chosen status filter', () => {
    create();
    tradeApi.getOrders.and.returnValue(of([]));

    page.querySelector<HTMLInputElement>('#status-FILLED')!.click();
    fixture.detectChanges();

    expect(tradeApi.getOrders).toHaveBeenCalledWith({ status: 'FILLED' });
    expect(page.querySelector('.tp-empty')?.textContent).toContain('No filled orders');
  });

  it('invites a first order when there are none', () => {
    tradeApi.getOrders.and.returnValue(of([]));
    create();

    expect(page.querySelector('.tp-empty a[href="/orders/new"]')).not.toBeNull();
  });

  it('shows a mapped error message when the API fails', () => {
    tradeApi.getOrders.and.returnValue(throwError(() => ({ errorCode: 'ACC-403', message: '', status: 403 })));
    create();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not active');
  });
});
