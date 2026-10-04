import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DEFAULT_WATCHLIST_NAME, WatchlistService } from './watchlist.service';
import { TradeApiService } from './trade-api.service';
import { WatchlistResponse } from '../../../generated/trade-client';

describe('WatchlistService (backend-backed)', () => {
  let service: WatchlistService;
  let tradeApi: jasmine.SpyObj<TradeApiService>;

  const defaultList: WatchlistResponse = { id: 1, name: DEFAULT_WATCHLIST_NAME, isDefault: true, symbols: ['AAPL'] };

  function configure(): void {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', [
      'getWatchlists',
      'getWatchlistDetail',
      'createWatchlist',
      'deleteWatchlist',
      'addWatchlistInstrument',
      'removeWatchlistInstrument',
      'searchInstruments'
    ]);
    tradeApi.getWatchlists.and.returnValue(of([defaultList]));
    tradeApi.getWatchlistDetail.and.returnValue(
      of({
        id: 1,
        name: DEFAULT_WATCHLIST_NAME,
        isDefault: true,
        stocks: [{ symbol: 'AAPL', name: 'Apple Inc.', price: 245.3, change: 1.25, changePercent: 0.51 }]
      })
    );
    tradeApi.searchInstruments.and.returnValue(of([]));

    TestBed.configureTestingModule({
      providers: [{ provide: TradeApiService, useValue: tradeApi }]
    });
    service = TestBed.inject(WatchlistService);
  }

  beforeEach(() => configure());
  afterEach(() => TestBed.resetTestingModule());

  it('loads watchlists from the backend instead of localStorage', () => {
    service.load();

    expect(tradeApi.getWatchlists).toHaveBeenCalled();
    expect(service.watchlists().length).toBe(1);
    expect(service.watchlists()[0].isDefault).toBe(true);
    expect(localStorage.getItem('tp_watchlists:u-1')).toBeNull();
  });

  it('creates a watchlist via POST and selects it', (done) => {
    service.load();
    tradeApi.createWatchlist.and.returnValue(
      of({ id: 2, name: 'Tech Stocks', isDefault: false, symbols: [] })
    );

    service.createWatchlist('Tech Stocks').subscribe({
      next: (created) => {
        expect(created.name).toBe('Tech Stocks');
        expect(service.watchlists().length).toBe(2);
        expect(String(service.selected()?.id)).toBe('2');
        done();
      },
      error: done.fail
    });
  });

  it('rejects blank, overlong and duplicate watchlist names without HTTP', (done) => {
    service.load();
    tradeApi.createWatchlist.and.returnValue(
      of({ id: 2, name: 'Tech Stocks', isDefault: false, symbols: [] })
    );

    service.createWatchlist('Tech Stocks').subscribe({
      next: () => {
        service.createWatchlist('   ').subscribe({ error: (err) => {
          expect(err.message).toBe('Give the watchlist a name.');
          expect(tradeApi.createWatchlist).toHaveBeenCalledTimes(1);
          done();
        }});
      },
      error: done.fail
    });
  });

  it('reports already-in-watchlist without a POST', (done) => {
    service.load();

    service.addToSelected('aapl').subscribe({
      next: (result) => {
        expect(result).toBe('already-in-watchlist');
        expect(tradeApi.addWatchlistInstrument).not.toHaveBeenCalled();
        done();
      },
      error: done.fail
    });
  });

  it('protects the default watchlist from deletion', (done) => {
    service.load();

    service.deleteWatchlist(1).subscribe({
      next: (removed) => {
        expect(removed).toBe(false);
        expect(tradeApi.deleteWatchlist).not.toHaveBeenCalled();
        done();
      },
      error: done.fail
    });
  });
});
