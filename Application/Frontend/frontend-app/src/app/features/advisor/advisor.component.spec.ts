import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdvisorComponent } from './advisor.component';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { PortfolioApiService } from '../../shared/services/portfolio-api.service';
import { CandleService } from '../../shared/services/candle.service';
import { Candle } from '../../shared/models/candle.models';
import { PricedPosition } from '../../shared/models/portfolio.models';
import { Account, Balance, Position } from '../../shared/models/order.models';

function candles(start: number, drift: number, phase: number): Candle[] {
  let close = start;
  return Array.from({ length: 260 }, (_, i) => {
    close *= 1 + drift + 0.015 * Math.sin(i * 0.9 + phase);
    const date = new Date(Date.UTC(2025, 9, 7) + i * 86400000).toISOString().slice(0, 10);
    return { date, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000, synthetic: false };
  });
}

describe('AdvisorComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let portfolioApi: jasmine.SpyObj<PortfolioApiService>;
  let candleService: jasmine.SpyObj<CandleService>;
  let fixture: ComponentFixture<AdvisorComponent>;
  let page: HTMLElement;

  const aapl: PricedPosition = {
    accountId: 6,
    symbol: 'AAPL',
    quantity: 15,
    averageCost: 150,
    costBasis: 2250,
    lastPrice: 200,
    marketValue: 3000,
    unrealisedPnl: 750,
    unrealisedPnlPercent: 33.33,
    currency: 'USD',
    priceAsOf: '2026-10-07T13:59:30Z',
    stale: false
  };

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        { provide: PortfolioApiService, useValue: portfolioApi },
        { provide: CandleService, useValue: candleService }
      ]
    });
    fixture = TestBed.createComponent(AdvisorComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  const all = (testId: string) => Array.from(page.querySelectorAll(`[data-testid="${testId}"]`));
  const text = (testId: string) => page.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getBalance', 'getPositions']);
    portfolioApi = jasmine.createSpyObj<PortfolioApiService>('PortfolioApiService', ['getPositions']);
    candleService = jasmine.createSpyObj<CandleService>('CandleService', ['getCandles']);

    tradeApi.getAccount.and.returnValue(of({ id: 6 } as Account));
    tradeApi.getBalance.and.returnValue(of({ cashBalance: 5000 } as Balance));
    portfolioApi.getPositions.and.returnValue(of([aapl]));
    const bySymbol: Record<string, Candle[]> = {
      AAPL: candles(150, 0.001, 0),
      MSFT: candles(400, 0.0008, 1),
      NVDA: candles(100, 0.002, 2)
    };
    candleService.getCandles.and.callFake((symbol: string) => of(bySymbol[symbol] ?? []));
  });

  it('shows the disclaimer, the summary and one advice card per holding', () => {
    create();
    expect(text('advisor-disclaimer')).toContain('not financial advice');
    expect(all('advisor-summary')[0].querySelectorAll('li').length).toBeGreaterThan(1);
    const cards = all('advice-card');
    expect(cards.length).toBe(1);
    expect(cards[0].getAttribute('data-symbol')).toBe('AAPL');
    expect(cards[0].querySelector('[data-testid="advice-action"]')?.textContent?.trim()).toBeTruthy();
    expect(text('advisor-probability')).toMatch(/%/);
  });

  it('recomputes when the target return changes', () => {
    create();
    const before = text('advisor-probability');
    const input = page.querySelector('[data-testid="advisor-target"]') as HTMLInputElement;
    input.value = '25';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const after = text('advisor-probability');
    expect(parseInt(after.replace(/\D/g, ''), 10)).toBeLessThanOrEqual(parseInt(before.replace(/\D/g, ''), 10));
    expect(page.textContent).toContain('+25%');
  });

  it('falls back to the account positions when no holding can be priced', () => {
    portfolioApi.getPositions.and.returnValue(throwError(() => ({ errorCode: 'MKT-503', message: '', status: 503 })));
    tradeApi.getPositions.and.returnValue(of([{ accountId: 6, symbol: 'MSFT', quantity: 2, averageCost: 300 }] as Position[]));
    create();
    expect(all('advice-card').map((c) => c.getAttribute('data-symbol'))).toEqual(['MSFT']);
  });

  it('shows an error when the account cannot be loaded', () => {
    tradeApi.getAccount.and.returnValue(throwError(() => ({ errorCode: 'ACC-404', message: '', status: 404 })));
    create();
    expect(text('advisor-error')).toBeTruthy();
    expect(all('advice-card').length).toBe(0);
  });
});
