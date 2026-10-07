import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError } from 'rxjs';
import { AddStockResult, Watchlist, WatchlistStock } from '../models/watchlist.models';
import { TradeApiService } from './trade-api.service';

export const DEFAULT_WATCHLIST_NAME = 'Default';
export const DEFAULT_WATCHLIST_SIZE = 10;
export const MAX_WATCHLISTS = 20;
export const MAX_WATCHLIST_NAME_LENGTH = 60;

/**
 * Database-backed watchlists.
 *
 * Membership lives in PostgreSQL (trading.watchlist / trading.watchlist_inst);
 * live price/change come from the backend market-data cache (Kafka
 * `market-data` -> LatestPriceCache -> REST). Nothing is stored in
 * `localStorage` anymore; the backend is the source of truth.
 *
 * Signals keep the existing component template working: `watchlists`,
 * `selected`, `selectedStocks`. Async work goes through HttpClient with the
 * JWT attached by authTokenInterceptor.
 */
@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private readonly tradeApi = inject(TradeApiService);

  private readonly lists = signal<Watchlist[]>([]);
  private readonly selectedId = signal<string | number>('default');
  private readonly stocks = signal<WatchlistStock[]>([]);
  private readonly catalog = signal<WatchlistStock[]>([]);
  private readonly loading = signal(false);

  /** All watchlists, default first. */
  readonly watchlists = this.lists.asReadonly();
  /** Id of the currently selected watchlist. */
  readonly selectedListId = this.selectedId.asReadonly();
  /** The currently selected watchlist (falls back to the default list). */
  readonly selected = computed<Watchlist | null>(() => {
    const all = this.lists();
    return (
      all.find((list) => String(list.id) === String(this.selectedId())) ??
      all.find((list) => list.isDefault) ??
      null
    );
  });
  /** Live-priced quotes for the selected watchlist, in backend order. */
  readonly selectedStocks = this.stocks.asReadonly();
  readonly isLoading = this.loading.asReadonly();

  /**
   * Loads the caller's watchlists from the backend (creating the default
   * server-side when missing), then the live-priced detail for the selected
   * list plus the instrument catalog for search.
   */
  load(): void {
    this.loading.set(true);
    this.tradeApi
      .getWatchlists()
      .pipe(
        switchMap((lists) => {
          const normalized = this.normalizeLists(lists);
          this.lists.set(normalized);
          const current = normalized.find((l) => String(l.id) === String(this.selectedId())) ??
            normalized.find((l) => l.isDefault) ??
            normalized[0];
          if (current) {
            this.selectedId.set(current.id);
          }
          if (!current) {
            return of({ detail: null as never, catalog: [] as WatchlistStock[] });
          }
          return forkJoin({
            detail: this.tradeApi.getWatchlistDetail(current.id).pipe(catchError(() => of(null))),
            catalog: this.tradeApi.searchInstruments('').pipe(catchError(() => of([] as WatchlistStock[])))
          });
        })
      )
      .subscribe({
        next: ({ detail, catalog }) => {
          if (detail) {
            this.applyDetail(detail);
          }
          this.catalog.set((catalog ?? []).map((s) => this.toStock(s)));
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  /**
   * Loads only the instrument catalog, for screens that search stocks without
   * showing a watchlist (the order ticket). Refetched on every call so the
   * prices next to each result are current. A failed refresh keeps the
   * catalog already held, since the watchlist page shares it.
   */
  loadCatalog(): void {
    this.tradeApi.searchInstruments('').subscribe({
      next: (catalog) => this.catalog.set((catalog ?? []).map((s) => this.toStock(s))),
      error: () => undefined
    });
  }

  /** Switches to another watchlist and refreshes its live prices. */
  select(id: string | number): void {
    if (String(this.selectedId()) === String(id)) {
      return;
    }
    if (!this.lists().some((list) => String(list.id) === String(id))) {
      return;
    }
    this.selectedId.set(id);
    this.refreshSelected();
  }

  /** Creates a watchlist server-side and selects it. */
  createWatchlist(name: string): Observable<Watchlist> {
    const trimmed = name.trim();
    if (!trimmed) {
      return throwError(() => new Error('Give the watchlist a name.'));
    }
    if (trimmed.length > MAX_WATCHLIST_NAME_LENGTH) {
      return throwError(() => new Error(`Names are at most ${MAX_WATCHLIST_NAME_LENGTH} characters.`));
    }
    if (this.lists().some((list) => list.name.toLowerCase() === trimmed.toLowerCase())) {
      return throwError(() => new Error('A watchlist with that name already exists.'));
    }
    if (this.lists().length >= MAX_WATCHLISTS) {
      return throwError(() => new Error(`You can keep at most ${MAX_WATCHLISTS} watchlists.`));
    }
    return this.tradeApi.createWatchlist(trimmed).pipe(
      map((created) => this.normalizeLists([created])[0]),
      tap((created) => {
        this.lists.update((all) => [...all, created]);
        this.selectedId.set(created.id);
        this.stocks.set([]);
      }),
      catchError((err) => {
        const message =
          err?.status === 409 ? 'A watchlist with that name already exists.' : (err?.message ?? 'Could not create the watchlist.');
        return throwError(() => new Error(message));
      })
    );
  }

  /** Deletes a user-created watchlist server-side. */
  deleteWatchlist(id: string | number): Observable<boolean> {
    const target = this.lists().find((list) => String(list.id) === String(id));
    if (!target || target.isDefault) {
      return of(false);
    }
    return this.tradeApi.deleteWatchlist(id).pipe(
      map(() => true),
      tap(() => {
        this.lists.update((all) => all.filter((list) => String(list.id) !== String(id)));
        if (String(this.selectedId()) === String(id)) {
          const fallback = this.lists().find((l) => l.isDefault) ?? this.lists()[0];
          if (fallback) {
            this.selectedId.set(fallback.id);
            this.refreshSelected();
          } else {
            this.stocks.set([]);
          }
        }
      }),
      catchError(() => of(false))
    );
  }

  /**
   * Adds a stock to the currently selected watchlist via the backend.
   * Emits 'already-in-watchlist' without a request when present.
   */
  addToSelected(symbol: string): Observable<AddStockResult> {
    const key = symbol.trim().toUpperCase();
    if (!key) {
      return throwError(() => new Error(`Unknown symbol "${symbol.trim()}".`));
    }
    const selected = this.selected();
    if (!selected) {
      return throwError(() => new Error('No watchlist is selected.'));
    }
    if (selected.symbols.includes(key)) {
      return of('already-in-watchlist');
    }
    const known = this.catalog().some((s) => s.symbol === key) || this.stocks().some((s) => s.symbol === key);
    void known;
    return this.tradeApi.addWatchlistInstrument(selected.id, key).pipe(
      map(() => 'added' as AddStockResult),
      tap(() => {
        this.lists.update((all) =>
          all.map((list) =>
            String(list.id) === String(selected.id)
              ? { ...list, symbols: [...list.symbols, key] }
              : list
          )
        );
        this.refreshSelected();
      }),
      catchError((err) => {
        if (err?.status === 404) {
          return throwError(() => new Error(`Unknown symbol "${symbol.trim()}".`));
        }
        return throwError(() => new Error(err?.message ?? 'Could not add the stock.'));
      })
    );
  }

  /** True when the symbol is already in the selected watchlist. */
  isInSelected(symbol: string): boolean {
    const selected = this.selected();
    return selected?.symbols.includes(symbol.trim().toUpperCase()) ?? false;
  }

  /** Removes a stock from the selected list server-side. */
  removeFromSelected(symbol: string): void {
    const key = symbol.trim().toUpperCase();
    const selected = this.selected();
    if (!selected) {
      return;
    }
    this.lists.update((all) =>
      all.map((list) =>
        String(list.id) === String(selected.id)
          ? { ...list, symbols: list.symbols.filter((s) => s !== key) }
          : list
      )
    );
    this.stocks.update((all) => all.filter((s) => s.symbol !== key));
    this.tradeApi.removeWatchlistInstrument(selected.id, key).subscribe({
      error: () => this.refreshSelected()
    });
  }

  /** Sync filter over the backend instrument catalog (name or symbol). */
  search(query: string): WatchlistStock[] {
    const key = query.trim().toLowerCase();
    if (!key) {
      return [];
    }
    // Prefer the backend catalog; fall back to selected stocks when offline.
    const base = this.catalog().length > 0 ? this.catalog() : this.stocks();
    return base.filter(
      (stock) => stock.symbol.toLowerCase().includes(key) || stock.companyName.toLowerCase().includes(key)
    );
  }

  /** Live quote for one symbol from the selected detail or catalog. */
  quote(symbol: string): WatchlistStock | undefined {
    const key = symbol.trim().toUpperCase();
    return (
      this.stocks().find((s) => s.symbol === key) ?? this.catalog().find((s) => s.symbol === key)
    );
  }

  private refreshSelected(): void {
    const selected = this.selected();
    if (!selected) {
      this.stocks.set([]);
      return;
    }
    this.tradeApi.getWatchlistDetail(selected.id).subscribe({
      next: (detail) => this.applyDetail(detail),
      error: () => {
        // Keep membership (symbols) even when live prices are unavailable.
        this.stocks.set(
          selected.symbols.map((symbol) => ({
            symbol,
            companyName: this.catalog().find((s) => s.symbol === symbol)?.companyName ?? symbol,
            price: this.catalog().find((s) => s.symbol === symbol)?.price ?? 0,
            change: 0,
            changePercent: 0
          }))
        );
      }
    });
  }

  private applyDetail(detail: { id: number; name: string; isDefault: boolean; stocks: Array<{ symbol: string; name: string; price: number; change: number; changePercent: number }> }): void {
    this.lists.update((all) =>
      all.map((list) =>
        String(list.id) === String(detail.id)
          ? { ...list, name: detail.name, isDefault: detail.isDefault, symbols: detail.stocks.map((s) => s.symbol) }
          : list
      )
    );
    this.stocks.set(detail.stocks.map((s) => this.toStock(s)));
    for (const s of detail.stocks) {
      const normalized = this.toStock(s);
      if (!this.catalog().some((c) => c.symbol === normalized.symbol)) {
        this.catalog.update((all) => [...all, normalized]);
      }
    }
  }

  private normalizeLists(lists: Array<{ id: string | number; name: string; isDefault: boolean; symbols: string[] }>): Watchlist[] {
    const mapped: Watchlist[] = lists.map((l) => ({
      id: l.id,
      name: l.name,
      isDefault: l.isDefault,
      symbols: [...new Set((l.symbols ?? []).map((s) => String(s).toUpperCase()))]
    }));
    mapped.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return mapped;
  }

  private toStock(s: { symbol: string; name?: string; companyName?: string; price: number; change: number; changePercent: number }): WatchlistStock {
    return {
      symbol: String(s.symbol).toUpperCase(),
      companyName: s.companyName ?? s.name ?? s.symbol,
      price: Number(s.price ?? 0),
      change: Number(s.change ?? 0),
      changePercent: Number(s.changePercent ?? 0)
    };
  }
}
