import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HoldingsComponent } from './holdings.component';
import { TradeApiService } from '../../shared/services/trade-api.service';

describe('HoldingsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<HoldingsComponent>;
  let page: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TradeApiService, useValue: tradeApi }]
    });
    fixture = TestBed.createComponent(HoldingsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getHoldings']);
    tradeApi.getHoldings.and.returnValue(
      of([
        { accountId: 6, symbol: 'ACME', quantity: 100, averageCost: 25, currentPrice: 27, marketValue: 2700, unrealizedPnl: 200, unrealizedPnlPercent: 8 }
      ])
    );
  });

  it('lists settled holdings like the positions table', () => {
    create();

    const rows = page.querySelectorAll('[data-testid="holding-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('ACME');
    expect(page.querySelector('[data-testid="holdings-count"]')?.textContent).toContain('1 holding');
  });

  it('explains the empty state and links to positions', () => {
    tradeApi.getHoldings.and.returnValue(of([]));
    create();

    expect(page.querySelector('[data-testid="holdings-empty"]')?.textContent).toContain('No settled holdings');
    expect(page.querySelector('[data-testid="holdings-to-positions"]')).not.toBeNull();
  });

  it('shows a mapped error when the API fails', () => {
    tradeApi.getHoldings.and.returnValue(throwError(() => ({ errorCode: 'ACC-403', message: '', status: 403 })));
    create();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not active');
  });
});
