import { Injectable, computed, inject, signal } from '@angular/core';
import { AddStockResult, Watchlist, WatchlistStock } from '../models/watchlist.models';
import { MarketDataService } from './market-data.service';
import { MockAuthService } from './mock-auth.service';

export const DEFAULT_WATCHLIST_ID = 'default';
export const DEFAULT_WATCHLIST_NAME = 'Default';
export const DEFAULT_WATCHLIST_SIZE = 10;
export const MAX_WATCHLISTS = 20;
export const MAX_WATCHLIST_NAME_LENGTH = 60;

/**
 * Owns the user's watchlists: the seeded default list plus user-created
 * lists, the selected list, and add/remove switching.
 *
 * ## Persistence
 *
 * Watchlists are persisted per authenticated user in `localStorage` under
 * `tp_watchlists:<userId>`, so they survive leaving and returning to the
 * page. Frontend storage is used because the current backend offers no
 * watchlist endpoints: contracts/trade-api.yaml has no watchlist paths even
 * though the database already has `trading.watchlist` / `watchlist_inst`
 * tables (see migrations/001_initial_trading_schema.sql). No JWT secret or
 * API key is stored here; writes go through no network at all.
 *
 * ## Required backend changes (before moving off localStorage)
 *
 * Extend contracts/trade-api.yaml with JWT-scoped endpoints that resolve the
 * owner from the token's `accountId`/`sub` claim (never from a client-sent
 * user id), regenerate the trade client, and add matching Spring controllers:
 *
 * - `GET /api/v1/instruments` - searchable instrument catalog (symbol, name,
 *   price, change, changePercent) to replace MarketDataService's static list.
 * - `GET /api/v1/instruments/top-sellers?limit=10` - backs the default list.
 * - `GET /api/v1/watchlists` - the caller's lists with their symbols.
 * - `POST /api/v1/watchlists { name }` - create a list (unique name/user).
 * - `DELETE /api/v1/watchlists/{id}` - delete a non-default list.
 * - `POST /api/v1/watchlists/{id}/symbols { symbol }` - idempotent add;
 *   duplicate returns the existing entry, not a second row.
 * - `DELETE /api/v1/watchlists/{id}/symbols/{symbol}` - remove one symbol.
 *
 * All of these must require the bearer JWT (AUTH-401 otherwise) and stay
 * scoped to the caller (ACC-403 across users), mirroring the existing
 * `/api/v1/accounts/me/*` routes. Until then this service is the single
 * place to swap: keep its public method names and back them with
 * TradeApiService calls.
 */
@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  private readonly marketData = inject(MarketDataService);
  private readonly authService = inject(MockAuthService);

  private readonly lists = signal<Watchlist[]>([]);
  private readonly selectedId = signal<string>(DEFAULT_WATCHLIST_ID);
  private loadedKey: string | null = null;

  /** All watchlists, default first. */
  readonly watchlists = this.lists.asReadonly();
  /** Id of the currently selected watchlist. */
  readonly selectedListId = this.selectedId.asReadonly();
  /** The currently selected watchlist (falls back to the default list). */
  readonly selected = computed<Watchlist | null>(() => {
    const all = this.lists();
    return all.find((list) => list.id === this.selectedId()) ?? all.find((list) => list.isDefault) ?? null;
  });
  /** Resolved quotes for the selected watchlist, in insertion order. */
  readonly selectedStocks = computed<WatchlistStock[]>(() => {
    const list = this.selected();
    if (!list) {
      return [];
    }
    return list.symbols
      .map((symbol) => this.marketData.quote(symbol))
      .filter((stock): stock is WatchlistStock => stock !== undefined);
  });

  /**
   * Loads (or seeds, on first access) the current user's watchlists. The
   * default list is seeded once with the top 10 selling stocks; afterwards
   * the stored state is authoritative, so removing every stock from the
   * default list stays removed.
   */
  load(): void {
    const key = this.storageKey();
    if (this.loadedKey === key && this.lists().length > 0) {
      return;
    }
    this.loadedKey = key;
    const stored = this.readStored(key);
    if (stored) {
      this.lists.set(stored.lists);
      this.selectedId.set(
        stored.lists.some((list) => list.id === stored.selectedId)
          ? stored.selectedId
          : (stored.lists.find((list) => list.isDefault)?.id ?? stored.lists[0].id)
      );
      return;
    }
    const seeded: Watchlist = {
      id: DEFAULT_WATCHLIST_ID,
      name: DEFAULT_WATCHLIST_NAME,
      isDefault: true,
      symbols: this.marketData.topSellers(DEFAULT_WATCHLIST_SIZE).map((stock) => stock.symbol)
    };
    this.lists.set([seeded]);
    this.selectedId.set(seeded.id);
    this.persist();
  }

  /** Switches to another watchlist. Unknown ids are ignored. */
  select(id: string): void {
    if (this.selectedId() !== id && this.lists().some((list) => list.id === id)) {
      this.selectedId.set(id);
      this.persist();
    }
  }

  /**
   * Creates a watchlist with the given name and selects it. Names are
   * trimmed, must not be blank, must fit the length limit and must be unique
   * (case-insensitive). Throws an `Error` describing the problem otherwise.
   */
  createWatchlist(name: string): Watchlist {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Give the watchlist a name.');
    }
    if (trimmed.length > MAX_WATCHLIST_NAME_LENGTH) {
      throw new Error(`Names are at most ${MAX_WATCHLIST_NAME_LENGTH} characters.`);
    }
    if (this.lists().some((list) => list.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A watchlist with that name already exists.');
    }
    if (this.lists().length >= MAX_WATCHLISTS) {
      throw new Error(`You can keep at most ${MAX_WATCHLISTS} watchlists.`);
    }
    const created: Watchlist = {
      id: this.newId(),
      name: trimmed,
      isDefault: false,
      symbols: []
    };
    this.lists.update((all) => [...all, created]);
    this.selectedId.set(created.id);
    this.persist();
    return created;
  }

  /**
   * Deletes a user-created watchlist. The default list is protected and
   * deleting it returns `false`. The selection falls back to the default.
   */
  deleteWatchlist(id: string): boolean {
    const target = this.lists().find((list) => list.id === id);
    if (!target || target.isDefault) {
      return false;
    }
    this.lists.update((all) => all.filter((list) => list.id !== id));
    if (this.selectedId() === id) {
      this.selectedId.set(DEFAULT_WATCHLIST_ID);
    }
    this.persist();
    return true;
  }

  /**
   * Adds a stock to the currently selected watchlist. Symbols are normalised
   * to uppercase; a symbol already present is reported as
   * `'already-in-watchlist'` and is never duplicated. Unknown symbols throw.
   */
  addToSelected(symbol: string): AddStockResult {
    const key = symbol.trim().toUpperCase();
    const quote = this.marketData.quote(key);
    if (!quote) {
      throw new Error(`Unknown symbol "${symbol.trim()}".`);
    }
    const selected = this.selected();
    if (!selected) {
      throw new Error('No watchlist is selected.');
    }
    if (selected.symbols.includes(quote.symbol)) {
      return 'already-in-watchlist';
    }
    this.lists.update((all) =>
      all.map((list) =>
        list.id === selected.id ? { ...list, symbols: [...list.symbols, quote.symbol] } : list
      )
    );
    this.persist();
    return 'added';
  }

  /** True when the symbol is already in the selected watchlist. */
  isInSelected(symbol: string): boolean {
    const selected = this.selected();
    return selected?.symbols.includes(symbol.trim().toUpperCase()) ?? false;
  }

  /** Removes a stock from the selected list only; other lists are untouched. */
  removeFromSelected(symbol: string): void {
    const key = symbol.trim().toUpperCase();
    const selected = this.selected();
    if (!selected) {
      return;
    }
    this.lists.update((all) =>
      all.map((list) =>
        list.id === selected.id ? { ...list, symbols: list.symbols.filter((s) => s !== key) } : list
      )
    );
    this.persist();
  }

  /** Search passthrough to the market-data source (name or symbol). */
  search(query: string): WatchlistStock[] {
    return this.marketData.search(query);
  }

  private storageKey(): string {
    const user = this.authService.getCurrentUser();
    return `tp_watchlists:${user?.id ?? 'guest'}`;
  }

  private readStored(key: string): { lists: Watchlist[]; selectedId: string } | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Watchlist[] | { lists: Watchlist[]; selectedId: string };
      // Tolerates the original plain-array shape as well as the current
      // `{ lists, selectedId }` shape, so older stored state keeps working.
      const storedLists = Array.isArray(parsed) ? parsed : parsed.lists;
      const storedSelection = Array.isArray(parsed) ? DEFAULT_WATCHLIST_ID : parsed.selectedId;
      if (!Array.isArray(storedLists)) {
        return null;
      }
      const valid = storedLists.filter(
        (list): list is Watchlist =>
          typeof list?.id === 'string' && typeof list?.name === 'string' && Array.isArray(list?.symbols)
      );
      if (valid.length === 0) {
        return null;
      }
      // The default list is structural: it must always exist and stay first.
      const rest = valid.filter((list) => list.id !== DEFAULT_WATCHLIST_ID);
      const storedDefault = valid.find((list) => list.id === DEFAULT_WATCHLIST_ID);
      const normalized: Watchlist[] = [
        {
          id: DEFAULT_WATCHLIST_ID,
          name: typeof storedDefault?.name === 'string' && storedDefault.name ? storedDefault.name : DEFAULT_WATCHLIST_NAME,
          isDefault: true,
          symbols: [...new Set((storedDefault?.symbols ?? []).map((s) => String(s).toUpperCase()))]
        },
        ...rest.map((list) => ({
          ...list,
          isDefault: false,
          symbols: [...new Set(list.symbols.map((s) => String(s).toUpperCase()))]
        }))
      ];
      return { lists: normalized, selectedId: storedSelection };
    } catch {
      return null;
    }
  }

  private persist(): void {
    if (this.loadedKey === null) {
      return;
    }
    try {
      localStorage.setItem(this.loadedKey, JSON.stringify({ lists: this.lists(), selectedId: this.selectedId() }));
    } catch {
      // Storage full or unavailable (private mode): the in-memory state
      // still works for this visit; there is nothing useful to show.
    }
  }

  private newId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `wl-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
