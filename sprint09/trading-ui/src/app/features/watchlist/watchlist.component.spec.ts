import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { WatchlistComponent } from './watchlist.component';
import { WatchlistService } from '../../shared/services/watchlist.service';

describe('WatchlistComponent (backend-backed)', () => {
  let fixture: ComponentFixture<WatchlistComponent>;
  let page: HTMLElement;

  function stubService() {
    const lists = signal([
      {
        id: 1,
        name: 'Default',
        isDefault: true,
        symbols: ['AAPL', 'MSFT']
      }
    ]);
    const selectedId = signal<string | number>(1);
    const stocks = signal([
      { symbol: 'AAPL', companyName: 'Apple Inc.', price: 245.3, change: 1.25, changePercent: 0.51 },
      { symbol: 'MSFT', companyName: 'Microsoft Corporation', price: 510.2, change: 2.1, changePercent: 0.41 }
    ]);
    return {
      watchlists: lists.asReadonly(),
      selected: () => lists().find((l) => l.id === selectedId()) ?? null,
      selectedStocks: stocks.asReadonly(),
      isLoading: signal(false).asReadonly(),
      select: (id: string | number) => selectedId.set(id),
      load: () => {},
      search: (q: string) =>
        q.trim().toLowerCase().includes('intel')
          ? [{ symbol: 'INTC', companyName: 'Intel Corporation', price: 21.3, change: -0.24, changePercent: -1.11 }]
          : q.trim()
            ? [...stocks()]
            : [],
      quote: (s: string) => stocks().find((x) => x.symbol === s.toUpperCase()),
      createWatchlist: (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) {
          return throwError(() => new Error('Give the watchlist a name.'));
        }
        if (lists().some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
          return throwError(() => new Error('A watchlist with that name already exists.'));
        }
        const created = { id: Date.now(), name: trimmed, isDefault: false, symbols: [] as string[] };
        lists.update((all) => [...all, created]);
        selectedId.set(created.id);
        return of(created);
      },
      deleteWatchlist: (id: string | number) => {
        const target = lists().find((l) => String(l.id) === String(id));
        if (!target || target.isDefault) {
          return of(false);
        }
        lists.update((all) => all.filter((l) => String(l.id) !== String(id)));
        selectedId.set(1);
        return of(true);
      },
      addToSelected: (symbol: string) => {
        const key = symbol.trim().toUpperCase();
        const sel = lists().find((l) => l.id === selectedId());
        if (sel?.symbols.includes(key)) {
          return of('already-in-watchlist' as const);
        }
        lists.update((all) =>
          all.map((l) => (l.id === selectedId() ? { ...l, symbols: [...l.symbols, key] } : l))
        );
        stocks.update((all) => [...all, { symbol: key, companyName: key, price: 100, change: 0, changePercent: 0 }]);
        return of('added' as const);
      },
      isInSelected: (symbol: string) =>
        lists().find((l) => l.id === selectedId())?.symbols.includes(symbol.trim().toUpperCase()) ?? false,
      removeFromSelected: (symbol: string) => {
        const key = symbol.trim().toUpperCase();
        lists.update((all) =>
          all.map((l) => (l.id === selectedId() ? { ...l, symbols: l.symbols.filter((s) => s !== key) } : l))
        );
        stocks.update((all) => all.filter((s) => s.symbol !== key));
      }
    };
  }

  function create(serviceOverride?: Partial<ReturnType<typeof stubService>>): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: WatchlistService, useValue: { ...stubService(), ...serviceOverride } }]
    });
    fixture = TestBed.createComponent(WatchlistComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  function searchFor(term: string): void {
    const input = page.querySelector<HTMLInputElement>('[data-testid="stock-search"]')!;
    input.value = term;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  const watchRows = () => Array.from(page.querySelectorAll('[data-testid="watch-row"]'));
  const searchRows = () => Array.from(page.querySelectorAll('[data-testid="search-row"]'));

  it('loads the default watchlist with live prices', () => {
    create();

    expect(watchRows().length).toBe(2);
    expect(page.textContent).toContain('AAPL');
    expect(page.textContent).toContain('Apple Inc.');
    expect(page.querySelector('[data-testid="watch-row"]')?.textContent).toContain('$');
    expect(page.querySelector('[data-testid="watch-row"]')?.textContent).toContain('%');
  });

  it('creates a watchlist and switches the selection to it', () => {
    create();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-new"]')!.click();
    fixture.detectChanges();

    const name = page.querySelector<HTMLInputElement>('[data-testid="watchlist-name"]')!;
    name.value = 'Tech Stocks';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-create"]')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('Watchlist “Tech Stocks” created.');
    expect(page.querySelector('[data-testid="watchlist-switch"].is-active')?.textContent).toContain('Tech Stocks');
  });

  it('rejects a duplicate watchlist name', () => {
    create();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-new"]')!.click();
    fixture.detectChanges();
    const name = page.querySelector<HTMLInputElement>('[data-testid="watchlist-name"]')!;
    name.value = 'Default';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-create"]')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('already exists');
  });

  it('searches by company name and adds the stock to the selected watchlist', () => {
    create();
    searchFor('Intel');

    expect(searchRows().length).toBe(1);
    expect(searchRows()[0].textContent).toContain('INTC');
    page.querySelector<HTMLButtonElement>('[data-testid="add-stock"]')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('INTC added to');
  });

  it('removes a stock from the selected watchlist', () => {
    create();
    const before = watchRows().length;

    page.querySelector<HTMLButtonElement>('[data-testid="remove-stock"]')!.click();
    fixture.detectChanges();

    expect(watchRows().length).toBe(before - 1);
    expect(page.textContent).toContain('removed from');
  });

  it('links each stock symbol and company to the place-order page with its symbol', () => {
    create();

    const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('[data-testid="trade-stock"]'));
    const aapl = links.filter((a) => a.dataset['symbol'] === 'AAPL');
    expect(aapl.length).toBe(2);
    for (const link of aapl) {
      expect(link.getAttribute('href')).toContain('/orders/new');
      expect(link.getAttribute('href')).toContain('symbol=AAPL');
    }
  });
});
