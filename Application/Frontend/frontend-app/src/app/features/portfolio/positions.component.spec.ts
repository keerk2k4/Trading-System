import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PositionsComponent } from './positions.component';
import { TradeApiService } from '../../shared/services/trade-api.service';

describe('PositionsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<PositionsComponent>;
  let page: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TradeApiService, useValue: tradeApi }]
    });
    fixture = TestBed.createComponent(PositionsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getPositions']);
    tradeApi.getPositions.and.returnValue(
      of([
        { accountId: 6, symbol: 'AAPL', quantity: 10, averageCost: 150, currentPrice: 160, marketValue: 1600, unrealizedPnl: 100, unrealizedPnlPercent: 6.67 }
      ])
    );
  });

  it('lists open positions like the dashboard table', () => {
    create();

    const rows = page.querySelectorAll('[data-testid="position-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('AAPL');
    expect(page.querySelector('[data-testid="positions-count"]')?.textContent).toContain('1 position');
  });

  it('explains the empty state and links to holdings', () => {
    tradeApi.getPositions.and.returnValue(of([]));
    create();

    expect(page.querySelector('[data-testid="positions-empty"]')?.textContent).toContain('No open positions');
    expect(page.querySelector('[data-testid="positions-to-holdings"]')).not.toBeNull();
  });

  it('shows a mapped error when the API fails', () => {
    tradeApi.getPositions.and.returnValue(throwError(() => ({ errorCode: 'ACC-403', message: '', status: 403 })));
    create();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('not active');
  });
});
