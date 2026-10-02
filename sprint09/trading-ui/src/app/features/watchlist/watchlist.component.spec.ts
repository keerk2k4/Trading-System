import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WatchlistComponent } from './watchlist.component';
import { WatchlistService } from '../../shared/services/watchlist.service';
import { MarketDataService } from '../../shared/services/market-data.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { MockAuthService } from '../../shared/services/mock-auth.service';

describe('WatchlistComponent', () => {
  const storageKey = 'tp_watchlists:u-9';
  let fixture: ComponentFixture<WatchlistComponent>;
  let page: HTMLElement;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        MarketDataService,
        WatchlistService,
        ErrorMappingService,
        {
          provide: MockAuthService,
          useValue: { getCurrentUser: () => ({ id: 'u-9', username: 'watcher', accountId: 6, roles: ['CUSTOMER'] }) }
        }
      ]
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

  beforeEach(() => localStorage.removeItem(storageKey));
  afterEach(() => localStorage.removeItem(storageKey));

  it('loads the default watchlist with the top 10 selling stocks', () => {
    create();

    expect(watchRows().length).toBe(10);
    expect(page.textContent).toContain('AAPL');
    expect(page.textContent).toContain('Apple Inc.');
    // Price and change columns render for each row.
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
    expect(page.querySelector<HTMLSelectElement>('[data-testid="watchlist-select"]')!.value).not.toBe('default');
    expect(page.textContent).toContain('0 stocks in Tech Stocks');
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

  it('switches between watchlists', () => {
    create();
    const service = TestBed.inject(WatchlistService);
    const tech = service.createWatchlist('Banking Stocks');
    fixture.detectChanges();

    const select = page.querySelector<HTMLSelectElement>('[data-testid="watchlist-select"]')!;
    select.value = tech.id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.textContent).toContain('0 stocks in Banking Stocks');
  });

  it('searches by company name and adds the stock to the selected watchlist', () => {
    create();
    searchFor('Intel');

    expect(searchRows().length).toBe(1);
    expect(searchRows()[0].textContent).toContain('INTC');
    page.querySelector<HTMLButtonElement>('[data-testid="add-stock"]')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('INTC added to');
    expect(watchRows().length).toBe(11);
  });

  it('searches by symbol and blocks duplicates with a message', () => {
    create();
    searchFor('aapl');

    expect(searchRows().length).toBe(1);
    expect(page.querySelector('[data-testid="already-added"]')?.textContent).toContain('Already in watchlist');
    expect(page.querySelector('[data-testid="add-stock"]')).toBeNull();
  });

  it('removes a stock from the selected watchlist', () => {
    create();
    const before = watchRows().length;

    page.querySelector<HTMLButtonElement>('[data-testid="remove-stock"]')!.click();
    fixture.detectChanges();

    expect(watchRows().length).toBe(before - 1);
    expect(page.textContent).toContain('removed from');
  });

  it('deletes a user-created watchlist after confirmation, never the default', () => {
    create();
    const service = TestBed.inject(WatchlistService);
    service.createWatchlist('Temporary');
    fixture.detectChanges();

    // Default list offers no delete action.
    const select = page.querySelector<HTMLSelectElement>('[data-testid="watchlist-select"]')!;
    select.value = 'default';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(page.querySelector('[data-testid="watchlist-delete"]')).toBeNull();

    select.value = service.watchlists().find((l) => l.name === 'Temporary')!.id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-delete"]')!.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('[data-testid="watchlist-delete-confirm"]')!.click();
    fixture.detectChanges();

    expect(page.textContent).toContain('deleted');
    expect(service.watchlists().some((l) => l.name === 'Temporary')).toBe(false);
  });

  it('reports a loading failure instead of an empty screen', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ErrorMappingService,
        {
          provide: WatchlistService,
          useValue: {
            watchlists: signal([]),
            selected: signal(null),
            selectedStocks: signal([]),
            search: () => [],
            load: () => {
              throw new Error('storage unavailable');
            },
            select: () => {},
            createWatchlist: () => {
              throw new Error('no');
            },
            deleteWatchlist: () => false,
            addToSelected: () => 'added' as const,
            isInSelected: () => false,
            removeFromSelected: () => {}
          }
        }
      ]
    });
    fixture = TestBed.createComponent(WatchlistComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Could not load your watchlists');
  });
});
