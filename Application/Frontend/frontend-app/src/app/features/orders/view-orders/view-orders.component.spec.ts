import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { POLL_INTERVAL_MS, POLL_MAX_DURATION_MS, ViewOrdersComponent } from './view-orders.component';
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

  it('shows realized P&L in green or red for filled sells and a muted dash otherwise', () => {
    tradeApi.getOrders.and.returnValue(
      of([
        order('ORD-BUY', '2026-01-01T10:00:00Z', { status: 'FILLED', executedPrice: 100 }),
        order('ORD-WIN', '2026-01-02T10:00:00Z', {
          side: 'SELL', status: 'FILLED', executedPrice: 108.5, realizedPnl: 200, realizedPnlPercent: 8.5
        }),
        order('ORD-LOSS', '2026-01-03T10:00:00Z', {
          side: 'SELL', status: 'FILLED', executedPrice: 96, realizedPnl: -8, realizedPnlPercent: -4
        })
      ])
    );
    create();

    const cell = (row: Element, id: string) => row.querySelector(`[data-testid="${id}"] app-pnl-value`)!;
    const [loss, win, buy] = rows();
    expect(cell(win, 'order-realized-pnl').textContent?.trim()).toBe('+$200.00');
    expect(cell(win, 'order-realized-pnl-percent').textContent?.trim()).toBe('+8.50%');
    expect(cell(win, 'order-realized-pnl').classList).toContain('tp-positive');
    expect(cell(loss, 'order-realized-pnl').textContent?.trim()).toBe('-$8.00');
    expect(cell(loss, 'order-realized-pnl-percent').textContent?.trim()).toBe('-4.00%');
    expect(cell(loss, 'order-realized-pnl-percent').classList).toContain('tp-negative');
    expect(cell(buy, 'order-realized-pnl').textContent?.trim()).toBe('—');
    expect(cell(buy, 'order-realized-pnl-percent').classList).toContain('tp-muted');
  });

  it('shows a mapped error message when the API fails', () => {
    tradeApi.getOrders.and.returnValue(throwError(() => ({ errorCode: 'ACC-403', message: '', status: 403 })));
    create();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not active');
  });

  describe('auto-polling', () => {
    const newOrder = () => order('ORD-1', '2026-01-01T10:00:00Z');
    const filledOrder = () => order('ORD-1', '2026-01-01T10:00:00Z', { status: 'FILLED', executedPrice: 150 });

    it('re-reads the orders every 5 seconds while one is NEW', fakeAsync(() => {
      tradeApi.getOrders.and.returnValue(of([newOrder()]));
      create();

      expect(fixture.componentInstance.isPolling()).toBe(true);
      expect(tradeApi.getOrders).toHaveBeenCalledTimes(1);

      tick(POLL_INTERVAL_MS);
      expect(tradeApi.getOrders).toHaveBeenCalledTimes(2);
      tick(POLL_INTERVAL_MS);
      expect(tradeApi.getOrders).toHaveBeenCalledTimes(3);

      fixture.destroy();
    }));

    it('only ever repeats the GET, never placing an order again', fakeAsync(() => {
      tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getOrders', 'placeOrder']);
      tradeApi.getOrders.and.returnValue(of([newOrder()]));
      create();

      tick(POLL_INTERVAL_MS * 3);

      expect(tradeApi.placeOrder).not.toHaveBeenCalled();
      fixture.destroy();
    }));

    it('stops once every order has reached a final status', fakeAsync(() => {
      tradeApi.getOrders.and.returnValue(of([newOrder()]));
      create();

      tradeApi.getOrders.and.returnValue(of([filledOrder()]));
      tick(POLL_INTERVAL_MS);
      expect(fixture.componentInstance.isPolling()).toBe(false);

      tick(POLL_INTERVAL_MS * 3);
      expect(tradeApi.getOrders).toHaveBeenCalledTimes(2);
    }));

    it('stops when the component is destroyed', fakeAsync(() => {
      tradeApi.getOrders.and.returnValue(of([newOrder()]));
      create();

      fixture.destroy();
      tick(POLL_INTERVAL_MS * 3);

      expect(fixture.componentInstance.isPolling()).toBe(false);
      expect(tradeApi.getOrders).toHaveBeenCalledTimes(1);
    }));

    it('gives up after 5 minutes even if an order stays NEW', fakeAsync(() => {
      tradeApi.getOrders.and.returnValue(of([newOrder()]));
      create();

      tick(POLL_MAX_DURATION_MS);
      expect(fixture.componentInstance.isPolling()).toBe(false);
      const calls = tradeApi.getOrders.calls.count();
      expect(calls).toBeLessThanOrEqual(POLL_MAX_DURATION_MS / POLL_INTERVAL_MS);

      tick(POLL_INTERVAL_MS * 3);
      expect(tradeApi.getOrders.calls.count()).toBe(calls);
    }));
  });
});
