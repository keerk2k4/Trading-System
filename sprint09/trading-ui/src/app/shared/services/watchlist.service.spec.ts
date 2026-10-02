import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WATCHLIST_ID,
  DEFAULT_WATCHLIST_NAME,
  WatchlistService
} from './watchlist.service';
import { MarketDataService } from './market-data.service';
import { MockAuthService } from './mock-auth.service';
import { User } from '../models/auth.models';

describe('WatchlistService', () => {
  const user: User = { id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] };
  const storageKey = 'tp_watchlists:u-1';
  let currentUser: User | null;
  let service: WatchlistService;

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        MarketDataService,
        { provide: MockAuthService, useValue: { getCurrentUser: () => currentUser } }
      ]
    });
    service = TestBed.inject(WatchlistService);
  }

  /** Simulates leaving and returning to the page: a fresh instance re-reads storage. */
  function reload(): WatchlistService {
    TestBed.resetTestingModule();
    configure();
    const fresh = TestBed.inject(WatchlistService);
    fresh.load();
    return fresh;
  }

  beforeEach(() => {
    currentUser = user;
    localStorage.removeItem(storageKey);
    localStorage.removeItem('tp_watchlists:u-2');
    configure();
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem('tp_watchlists:u-2');
    TestBed.resetTestingModule();
  });

  it('seeds a default watchlist with the top 10 selling stocks on first access', () => {
    service.load();

    const lists = service.watchlists();
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe(DEFAULT_WATCHLIST_ID);
    expect(lists[0].name).toBe(DEFAULT_WATCHLIST_NAME);
    expect(lists[0].isDefault).toBe(true);
    expect(lists[0].symbols.length).toBe(10);
    expect(service.selected()?.id).toBe(DEFAULT_WATCHLIST_ID);
    expect(service.selectedStocks().length).toBe(10);
  });

  it('creates a watchlist, names it and switches to it', () => {
    service.load();

    const created = service.createWatchlist('Tech Stocks');

    expect(created.name).toBe('Tech Stocks');
    expect(created.isDefault).toBe(false);
    expect(service.watchlists().length).toBe(2);
    expect(service.selected()?.id).toBe(created.id);
  });

  it('rejects blank, overlong and duplicate watchlist names', () => {
    service.load();
    service.createWatchlist('Tech Stocks');

    expect(() => service.createWatchlist('   ')).toThrowError('Give the watchlist a name.');
    expect(() => service.createWatchlist('x'.repeat(61))).toThrowError('Names are at most 60 characters.');
    expect(() => service.createWatchlist('tech stocks')).toThrowError('A watchlist with that name already exists.');
  });

  it('switches between watchlists', () => {
    service.load();
    const tech = service.createWatchlist('Tech Stocks');
    const banks = service.createWatchlist('Banking Stocks');

    service.select(tech.id);

    expect(service.selected()?.id).toBe(tech.id);
    service.select(banks.id);
    expect(service.selected()?.id).toBe(banks.id);
    service.select('missing');
    expect(service.selected()?.id).toBe(banks.id);
  });

  it('searches stocks by name and by symbol', () => {
    service.load();

    expect(service.search('Apple').map((s) => s.symbol)).toContain('AAPL');
    expect(service.search('msft').map((s) => s.symbol)).toContain('MSFT');
    expect(service.search('   ')).toEqual([]);
  });

  it('adds a stock to the selected watchlist', () => {
    service.load();
    service.createWatchlist('My Favorites');

    expect(service.addToSelected('amd')).toBe('added');
    expect(service.selected()?.symbols).toContain('AMD');
    expect(service.selectedStocks().map((s) => s.symbol)).toContain('AMD');
  });

  it('refuses to add the same stock twice to one watchlist', () => {
    service.load();

    // AAPL is seeded in the default list.
    expect(service.addToSelected('aapl')).toBe('already-in-watchlist');
    const occurrences = service.selected()?.symbols.filter((s) => s === 'AAPL').length;
    expect(occurrences).toBe(1);
  });

  it('allows the same stock in different watchlists', () => {
    service.load();
    const tech = service.createWatchlist('Tech Stocks');
    service.createWatchlist('Banking Stocks');

    service.select(tech.id);
    expect(service.addToSelected('BAC')).toBe('added');
    service.select(service.watchlists().find((l) => l.name === 'Banking Stocks')!.id);
    expect(service.addToSelected('BAC')).toBe('added');

    expect(service.watchlists().find((l) => l.id === tech.id)?.symbols).toContain('BAC');
  });

  it('removes a stock only from the selected watchlist', () => {
    service.load();
    const tech = service.createWatchlist('Tech Stocks');
    service.addToSelected('BAC');
    service.select(DEFAULT_WATCHLIST_ID);
    service.addToSelected('BAC');

    service.select(tech.id);
    service.removeFromSelected('BAC');

    expect(service.selected()?.symbols).not.toContain('BAC');
    expect(service.watchlists().find((l) => l.id === DEFAULT_WATCHLIST_ID)?.symbols).toContain('BAC');
  });

  it('protects the default watchlist from deletion and deletes user lists', () => {
    service.load();
    const tech = service.createWatchlist('Tech Stocks');

    expect(service.deleteWatchlist(DEFAULT_WATCHLIST_ID)).toBe(false);
    expect(service.watchlists().some((l) => l.isDefault)).toBe(true);
    expect(service.deleteWatchlist(tech.id)).toBe(true);
    expect(service.watchlists().some((l) => l.id === tech.id)).toBe(false);
    expect(service.selected()?.id).toBe(DEFAULT_WATCHLIST_ID);
  });

  it('persists watchlists when leaving and returning to the page', () => {
    service.load();
    service.createWatchlist('Tech Stocks');
    service.addToSelected('BAC');
    service.select(DEFAULT_WATCHLIST_ID);
    service.removeFromSelected('AAPL');
    service.select(service.watchlists().find((l) => l.name === 'Tech Stocks')!.id);

    const returned = reload();

    expect(returned.watchlists().length).toBe(2);
    expect(returned.watchlists().find((l) => l.name === 'Tech Stocks')?.symbols).toContain('BAC');
    expect(returned.watchlists().find((l) => l.isDefault)?.symbols).not.toContain('AAPL');
    expect(returned.selected()?.name).toBe('Tech Stocks');
  });

  it('keeps each user’s watchlists separate', () => {
    service.load();
    service.createWatchlist('Mine');

    currentUser = { id: 'u-2', username: 'other', accountId: 7, roles: ['CUSTOMER'] };
    const other = reload();

    expect(other.watchlists().length).toBe(1);
    expect(other.watchlists()[0].isDefault).toBe(true);
  });
});
