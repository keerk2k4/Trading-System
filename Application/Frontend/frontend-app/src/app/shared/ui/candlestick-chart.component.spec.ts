import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CandlestickChartComponent } from './candlestick-chart.component';
import { Candle } from '../models/candle.models';

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = 100 + i;
    // Alternate up and down days.
    const close = i % 2 === 0 ? open + 2 : open - 2;
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { date, open, high: open + 5, low: open - 5, close, volume: 1000, synthetic: false };
  });
}

describe('CandlestickChartComponent', () => {
  let fixture: ComponentFixture<CandlestickChartComponent>;
  let backend: HttpTestingController;
  let page: HTMLElement;

  const all = (selector: string) => page.querySelectorAll(selector);
  const el = (selector: string) => page.querySelector<HTMLElement>(selector)!;

  function show(symbol: string): void {
    fixture.componentRef.setInput('symbol', symbol);
    fixture.detectChanges();
  }

  function respond(symbol: string, data: Candle[]): void {
    backend.expectOne(`candles/${symbol}.json`).flush({ data: { symbol, interval: '1d', currency: 'USD', candles: data } });
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CandlestickChartComponent);
    page = fixture.nativeElement;
  });

  afterEach(() => backend.verify());

  it('draws one candle per day of the default 3-month range, coloured by direction', () => {
    show('AAPL');
    expect(el('[data-testid="candle-loading"]')).toBeTruthy();

    respond('AAPL', candles(100));

    expect(all('[data-testid="candle"]').length).toBe(66);
    expect(all('g.up').length).toBe(33);
    expect(all('g.down').length).toBe(33);
    expect(el('svg').getAttribute('aria-label')).toContain('AAPL daily candles');
  });

  it('changes the number of candles with the range buttons', () => {
    show('MSFT');
    respond('MSFT', candles(100));

    el('[data-testid="candle-range-1M"]').click();
    fixture.detectChanges();
    expect(all('[data-testid="candle"]').length).toBe(22);

    el('[data-testid="candle-range-1Y"]').click();
    fixture.detectChanges();
    expect(all('[data-testid="candle"]').length).toBe(100);
  });

  it('shows the latest prices, and those of a hovered candle', () => {
    show('TSLA');
    respond('TSLA', candles(3));

    expect(el('[data-testid="candle-ohlc"]').textContent).toContain('2026-01-03');

    all('[data-testid="candle"]')[0].dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(el('[data-testid="candle-ohlc"]').textContent).toContain('2026-01-01');
    expect(el('[data-testid="candle-ohlc"]').textContent).toContain('O $100.00');
  });

  it('says there is no such instrument for a symbol without saved data, without a request', () => {
    show('IBM');

    expect(el('[data-testid="candle-error"]').textContent).toContain('There is no such instrument: IBM');
    expect(all('[data-testid="candle"]').length).toBe(0);
  });

  it('reports a failed load', () => {
    show('NVDA');
    backend.expectOne('candles/NVDA.json').flush('missing', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el('[data-testid="candle-error"]').textContent).toContain('could not be loaded');
  });
});
