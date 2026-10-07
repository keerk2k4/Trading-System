import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { PortfolioApiService } from '../../shared/services/portfolio-api.service';
import { CandleService } from '../../shared/services/candle.service';
import { PortfolioSummary, PricedPosition } from '../../shared/models/portfolio.models';

describe('PortfolioComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let portfolioApi: jasmine.SpyObj<PortfolioApiService>;
  let candles: jasmine.SpyObj<CandleService>;
  let fixture: ComponentFixture<PortfolioComponent>;
  let page: HTMLElement;

  const summary: PortfolioSummary = {
    accountId: 6,
    baseCurrency: 'USD',
    cashBalance: 41847.05,
    marketValue: 10043.35,
    costBasis: 8276.2,
    unrealisedPnl: 1767.15,
    unrealisedPnlPercent: 21.35,
    realisedPnl: 123.3,
    totalValue: 51890.4,
    positionCount: 2,
    partial: false,
    asOf: '2026-10-07T14:00:00Z'
  };

  const aapl: PricedPosition = {
    accountId: 6,
    symbol: 'AAPL',
    quantity: 15,
    averageCost: 277.55,
    costBasis: 4163.25,
    lastPrice: 333.63,
    marketValue: 5004.45,
    unrealisedPnl: 841.2,
    unrealisedPnlPercent: 20.21,
    currency: 'USD',
    priceAsOf: '2026-10-07T13:59:30Z',
    stale: false
  };

  const msftUnpriced: PricedPosition = {
    accountId: 6,
    symbol: 'MSFT',
    quantity: 5,
    averageCost: 407.77,
    costBasis: 2038.85,
    lastPrice: null,
    marketValue: null,
    unrealisedPnl: null,
    unrealisedPnlPercent: null,
    currency: 'USD',
    priceAsOf: null,
    stale: true
  };

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        { provide: PortfolioApiService, useValue: portfolioApi },
        { provide: CandleService, useValue: candles }
      ]
    });
    fixture = TestBed.createComponent(PortfolioComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  const text = (testId: string) => page.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getBalance', 'getPositions', 'getOrders']);
    portfolioApi = jasmine.createSpyObj<PortfolioApiService>('PortfolioApiService', ['getSummary', 'getPositions', 'getPnl']);
    candles = jasmine.createSpyObj<CandleService>('CandleService', ['hasCandles', 'getCandles']);

    tradeApi.getAccount.and.returnValue(
      of({ id: 6, accountId: 'ACC-100006', holderName: 'Priya Menon', cashBalance: 41847.05, status: 'ACTIVE', version: 0, lastUpdated: '' })
    );
    tradeApi.getOrders.and.returnValue(
      of([
        {
          orderId: 'ORD-601',
          accountId: 6,
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 15,
          price: 277.55,
          executedPrice: 277.55,
          status: 'FILLED',
          createdOn: '2026-10-05T19:55:00Z'
        }
      ])
    );
    candles.hasCandles.and.returnValue(true);
    candles.getCandles.and.returnValue(
      of([
        { date: '2026-10-05', open: 330, high: 334, low: 329, close: 332.89, volume: 1, synthetic: false },
        { date: '2026-10-06', open: 332, high: 334, low: 330, close: 333.63, volume: 1, synthetic: false }
      ])
    );
    portfolioApi.getSummary.and.returnValue(of(summary));
    portfolioApi.getPositions.and.returnValue(of([aapl]));
    portfolioApi.getPnl.and.returnValue(
      of({
        accountId: 6,
        baseCurrency: 'USD',
        from: null,
        to: null,
        realisedPnl: 123.3,
        unrealisedPnl: 841.2,
        totalPnl: 964.5,
        bySymbol: [
          { symbol: 'AAPL', realisedPnl: 0, unrealisedPnl: 841.2, totalPnl: 841.2 },
          { symbol: 'NVDA', realisedPnl: 123.3, unrealisedPnl: 0, totalPnl: 123.3 }
        ],
        asOf: '2026-10-07T14:00:00Z'
      })
    );
  });

  it('shows the totals the portfolio routes return for the signed-in account', () => {
    create();

    expect(portfolioApi.getSummary).toHaveBeenCalledWith(6);
    expect(text('portfolio-total')).toBe('$51,890.40');
    expect(text('portfolio-cash')).toBe('$41,847.05');
    expect(text('portfolio-market-value')).toBe('$10,043.35');
    expect(text('portfolio-unrealised')).toBe('+$1,767.15');
    expect(text('portfolio-realised')).toBe('+$123.30');
    expect(text('portfolio-total-pnl')).toBe('+$1,890.45');
    expect(page.querySelector('[data-testid="portfolio-partial"]')).toBeNull();
  });

  it('lists priced holdings and the per-instrument P&L', () => {
    create();

    const holding = page.querySelector('[data-testid="holding-row"][data-symbol="AAPL"]')?.textContent ?? '';
    expect(holding).toContain('$333.63');
    expect(holding).toContain('+$841.20');
    expect(page.querySelectorAll('[data-testid="pnl-row"]').length).toBe(2);
    expect(text('pnl-total-row')).toContain('+$964.50');
  });

  it('marks a partial answer and an unpriced holding instead of hiding it', () => {
    portfolioApi.getSummary.and.returnValue(of({ ...summary, partial: true }));
    portfolioApi.getPositions.and.returnValue(of([aapl, msftUnpriced]));
    create();

    expect(page.querySelector('[data-testid="portfolio-partial"]')).not.toBeNull();
    const msft = page.querySelector('[data-testid="holding-row"][data-symbol="MSFT"]');
    expect(msft?.querySelector('[data-testid="holding-unpriced"]')).not.toBeNull();
    expect(msft?.textContent).toContain('$2,038.85');
  });

  it('marks a delayed price as delayed', () => {
    portfolioApi.getPositions.and.returnValue(of([{ ...aapl, stale: true }]));
    create();

    expect(page.querySelector('[data-testid="portfolio-stale"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="holding-stale"]')).not.toBeNull();
  });

  it('falls back to unpriced holdings when no price is available (MKT-503)', () => {
    portfolioApi.getSummary.and.returnValue(throwError(() => ({ errorCode: 'MKT-503', message: 'Pricing unavailable', status: 503 })));
    tradeApi.getPositions.and.returnValue(of([{ accountId: 6, symbol: 'AAPL', quantity: 15, averageCost: 277.55 }]));
    tradeApi.getBalance.and.returnValue(of({ accountId: 6, cashBalance: 41847.05, currency: 'USD', asOf: '2026-10-07T14:00:00Z' }));
    create();

    expect(page.querySelector('[data-testid="portfolio-pricing-unavailable"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="portfolio-error"]')).toBeNull();
    expect(text('portfolio-cash')).toBe('$41,847.05');
    const row = page.querySelector('[data-testid="holding-row"][data-symbol="AAPL"]');
    expect(row?.textContent).toContain('$4,163.25');
    expect(row?.querySelector('[data-testid="holding-unpriced"]')).not.toBeNull();
  });

  it('applies the realised P&L date range and explains an inverted one', () => {
    create();
    portfolioApi.getPnl.calls.reset();
    portfolioApi.getPnl.and.returnValue(throwError(() => ({ errorCode: 'VAL-422', message: 'Invalid input', status: 422 })));

    const from = page.querySelector<HTMLInputElement>('[data-testid="pnl-from"]')!;
    const to = page.querySelector<HTMLInputElement>('[data-testid="pnl-to"]')!;
    from.value = '2026-10-01';
    from.dispatchEvent(new Event('input'));
    to.value = '2026-09-01';
    to.dispatchEvent(new Event('input'));
    page.querySelector<HTMLButtonElement>('[data-testid="pnl-apply"]')!.click();
    fixture.detectChanges();

    expect(portfolioApi.getPnl).toHaveBeenCalledWith(6, { from: '2026-10-01', to: '2026-09-01' }, true);
    expect(text('pnl-error')).toBe('The start date must be on or before the end date.');
  });

  it('charts value over time from the filled orders and saved candles', () => {
    create();

    expect(tradeApi.getOrders).toHaveBeenCalledWith({ status: 'FILLED' });
    expect(candles.getCandles).toHaveBeenCalledWith('AAPL');
    expect(page.querySelector('[data-testid="portfolio-line-pnl"]')).not.toBeNull();
    expect(page.querySelectorAll('[data-testid="portfolio-trade-marker"]').length).toBe(1);
    expect(text('portfolio-chart-readout')).toContain('2026-10-06');
  });

  it('shows total P&L by default and switches to value against cost', () => {
    create();

    expect(page.querySelector('[data-testid="portfolio-zero-line"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="portfolio-line-cost"]')).toBeNull();
    // 15 x 333.63 - 15 x 277.55 on 6 Oct
    expect(text('portfolio-chart-readout')).toContain('+$841.20');

    page.querySelector<HTMLButtonElement>('[data-testid="portfolio-mode-value"]')!.click();
    fixture.detectChanges();

    expect(page.querySelector('[data-testid="portfolio-line-cost"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="portfolio-zero-line"]')).toBeNull();
    expect(text('portfolio-chart-readout')).toContain('$5,004.45');
  });

  it('shows return % against the market, and P&L split by stock', () => {
    create();

    // Every instrument with saved candles is loaded for the market line.
    expect(candles.getCandles).toHaveBeenCalledWith('NVDA');
    expect(candles.getCandles).toHaveBeenCalledWith('TSLA');

    page.querySelector<HTMLButtonElement>('[data-testid="portfolio-mode-return"]')!.click();
    fixture.detectChanges();
    expect(page.querySelector('[data-testid="portfolio-line-return"]')).not.toBeNull();
    expect(page.querySelector('[data-testid="portfolio-line-market"]')).not.toBeNull();
    expect(text('portfolio-benchmark-note')).toContain('AAPL, AMZN, GOOGL');
    // Bought at 277.55, so the close of 332.89 -> 333.63 is all the return there is: +0.22%.
    expect(text('portfolio-chart-readout')).toContain('+0.22%');

    page.querySelector<HTMLButtonElement>('[data-testid="portfolio-mode-stocks"]')!.click();
    fixture.detectChanges();
    expect(page.querySelector('[data-testid="portfolio-line-symbol-AAPL"]')).not.toBeNull();
    expect(text('portfolio-chart-readout')).toContain('AAPL +$841.20');
  });

  it('adds a moving average to the P&L line on request', () => {
    create();
    expect(page.querySelector('[data-testid="portfolio-line-average"]')).toBeNull();

    page.querySelector<HTMLInputElement>('[data-testid="portfolio-average-toggle"]')!.click();
    fixture.detectChanges();

    expect(page.querySelector('[data-testid="portfolio-legend-average"]')?.textContent).toContain('20-day average');
  });
});
