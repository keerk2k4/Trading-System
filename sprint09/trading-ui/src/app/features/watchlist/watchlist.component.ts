import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { WatchlistService } from '../../shared/services/watchlist.service';

/**
 * Watchlist page: switch between the seeded default list and user-created
 * lists, search stocks by company name or symbol, add them to the selected
 * list (duplicates are refused), and remove them again.
 */
@Component({
  selector: 'app-watchlist',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Watchlist</h1>
          <p>Track the stocks you care about, grouped into lists.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-primary tp-btn-icon-plus"
            data-icon
            type="button"
            data-testid="watchlist-new"
            (click)="toggleCreate()"
          >
            {{ createMode() ? 'Close' : 'Create Watchlist' }}
          </button>
        </div>
      </header>

      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert"><span>{{ message }}</span></div>
      }
      @if (notice(); as note) {
        <div class="tp-alert tp-alert-info" role="status"><span>{{ note }}</span></div>
      }

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="watchlist-heading" [attr.aria-busy]="isLoading()">
          <div class="tp-panel-header">
            <div>
              <h2 id="watchlist-heading">Watchlists</h2>
              <p class="tp-num" role="status">
                @if (isLoading()) {
                  Loading watchlist…
                } @else {
                  {{ stocks().length }} {{ stocks().length === 1 ? 'stock' : 'stocks' }} in
                  {{ selected()?.name ?? 'watchlist' }}
                }
              </p>
            </div>
            <div class="wl-picker">
              <label class="sr-only" for="wl-select">Selected watchlist</label>
              <select
                id="wl-select"
                class="tp-input wl-select"
                data-testid="watchlist-select"
                (change)="onSelect($event)"
              >
                @for (list of watchlists(); track list.id) {
                  <option [value]="list.id" [selected]="list.id === selected()?.id">
                    {{ list.name }}{{ list.isDefault ? ' (Default)' : '' }}
                  </option>
                }
              </select>
              @if (selected() && !selected()!.isDefault) {
                @if (pendingDeleteId() === selected()!.id) {
                  <button
                    class="tp-btn tp-btn-danger"
                    type="button"
                    data-testid="watchlist-delete-confirm"
                    (click)="confirmDelete()"
                  >
                    Confirm delete
                  </button>
                  <button class="tp-btn tp-btn-secondary" type="button" (click)="cancelDelete()">Keep</button>
                } @else {
                  <button
                    class="tp-btn tp-btn-danger"
                    type="button"
                    data-testid="watchlist-delete"
                    (click)="requestDelete(selected()!.id)"
                  >
                    Delete
                  </button>
                }
              }
            </div>
          </div>

          <div class="tp-panel-body">
            <div>
              <label class="tp-label" for="wl-search">Search stocks</label>
              <input
                id="wl-search"
                class="tp-input"
                type="search"
                placeholder="Search stocks..."
                autocomplete="off"
                spellcheck="false"
                data-testid="stock-search"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
              />
              <p class="tp-hint">Search by company name or symbol, for example Apple or AAPL.</p>
            </div>

            @if (searchQuery().trim()) {
              <div class="wl-results" role="region" aria-label="Search results">
                @if (searchResults().length === 0) {
                  <p class="tp-muted">No stocks match “{{ searchQuery().trim() }}”.</p>
                } @else {
                  <ul class="wl-list">
                    @for (stock of searchResults(); track stock.symbol) {
                      <li class="wl-row" data-testid="search-row">
                        <div class="wl-identity">
                          <strong>{{ stock.symbol }}</strong>
                          <span class="tp-muted">{{ stock.companyName }}</span>
                        </div>
                        <span class="tp-num">{{ stock.price | currency }}</span>
                        @if (service.isInSelected(stock.symbol)) {
                          <span class="tp-muted" data-testid="already-added">Already in watchlist</span>
                        } @else {
                          <button
                            class="tp-btn tp-btn-secondary"
                            type="button"
                            data-testid="add-stock"
                            [attr.data-symbol]="stock.symbol"
                            (click)="add(stock.symbol)"
                          >
                            Add
                          </button>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            }

            <h3 class="wl-subheading">Stocks in this watchlist</h3>
            @if (isLoading()) {
              <p class="tp-empty">Loading watchlist…</p>
            } @else if (stocks().length === 0) {
              <div class="tp-empty">
                <strong>No stocks yet</strong>
                Search above and add your first stock to this watchlist.
              </div>
            } @else {
              <div class="tp-table-wrap" tabindex="0" role="region" aria-label="Watchlist stocks">
                <table class="tp-table">
                  <thead>
                    <tr>
                      <th scope="col">Symbol</th>
                      <th scope="col">Company</th>
                      <th scope="col" class="num">Price</th>
                      <th scope="col" class="num">Change</th>
                      <th scope="col"><span class="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (stock of stocks(); track stock.symbol) {
                      <tr data-testid="watch-row" [attr.data-symbol]="stock.symbol">
                        <td>
                          <strong>{{ stock.symbol }}</strong>
                        </td>
                        <td>{{ stock.companyName }}</td>
                        <td class="num">{{ stock.price | currency }}</td>
                        <td
                          class="num"
                          [class.tp-positive]="stock.change >= 0"
                          [class.tp-negative]="stock.change < 0"
                        >
                          {{ stock.change >= 0 ? '+' : '' }}{{ stock.change | number: '1.2-2' }} ({{
                            stock.change >= 0 ? '+' : ''
                          }}{{ stock.changePercent | number: '1.2-2' }}%)
                        </td>
                        <td class="num">
                          <button
                            class="tp-btn tp-btn-secondary wl-remove"
                            type="button"
                            data-testid="remove-stock"
                            [attr.data-symbol]="stock.symbol"
                            [attr.aria-label]="'Remove ' + stock.symbol + ' from watchlist'"
                            (click)="remove(stock.symbol)"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </section>

        <aside class="tp-panel" aria-labelledby="lists-heading">
          <div class="tp-panel-header">
            <h2 id="lists-heading">Your lists</h2>
          </div>
          <div class="tp-panel-body">
            @if (createMode()) {
              <form class="wl-create" (submit)="create($event)">
                <label class="tp-label" for="wl-name">New watchlist name</label>
                <input
                  id="wl-name"
                  class="tp-input"
                  type="text"
                  maxlength="60"
                  placeholder="For example Tech Stocks"
                  data-testid="watchlist-name"
                  [value]="newName()"
                  (input)="newName.set($any($event.target).value)"
                />
                @if (createError(); as message) {
                  <p class="tp-field-error" role="alert">{{ message }}</p>
                }
                <div class="tp-actions">
                  <button class="tp-btn tp-btn-primary" type="submit" data-testid="watchlist-create">
                    Create
                  </button>
                  <button class="tp-btn tp-btn-secondary" type="button" (click)="toggleCreate()">Cancel</button>
                </div>
              </form>
            }
            <ul class="wl-side-list">
              @for (list of watchlists(); track list.id) {
                <li>
                  <button
                    type="button"
                    class="wl-side-item"
                    data-testid="watchlist-switch"
                    [attr.data-list]="list.id"
                    [class.is-active]="list.id === selected()?.id"
                    [attr.aria-current]="list.id === selected()?.id ? 'true' : null"
                    (click)="onSwitch(list.id)"
                  >
                    <span class="wl-side-name">{{ list.name }}</span>
                    <span class="tp-muted tp-num">{{ stockCount(list.id) }}</span>
                  </button>
                </li>
              }
            </ul>
            <p class="tp-hint">The Default list cannot be deleted.</p>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      .wl-picker {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .wl-select {
        width: auto;
        min-width: 11rem;
        min-height: 2.5rem;
      }
      .wl-results {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--tp-border);
      }
      .wl-list {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .wl-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--tp-border);
        border-radius: var(--tp-radius);
        background-color: var(--tp-surface-raised);
      }
      .wl-identity {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .wl-identity span {
        font-size: 0.8125rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .wl-subheading {
        margin: 1.25rem 0 0.5rem;
        font-size: 0.9375rem;
      }
      .wl-remove {
        min-height: 2.25rem;
        padding: 0.375rem 0.75rem;
      }
      .wl-create {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        margin-bottom: 1rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--tp-border);
      }
      .wl-side-list {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .wl-side-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        font-weight: 500;
        text-align: left;
        border-radius: var(--tp-radius);
        color: var(--tp-text-muted);
      }
      .wl-side-item:hover {
        color: var(--tp-text);
        background-color: var(--tp-surface-raised);
      }
      .wl-side-item.is-active {
        color: var(--tp-text);
        background-color: var(--tp-glow);
        box-shadow: inset 2px 0 0 var(--tp-accent);
      }
      .wl-side-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `
  ]
})
export class WatchlistComponent implements OnInit {
  protected readonly service = inject(WatchlistService);

  protected readonly watchlists = this.service.watchlists;
  protected readonly selected = this.service.selected;
  protected readonly stocks = this.service.selectedStocks;

  protected readonly searchQuery = signal('');
  protected readonly searchResults = computed(() => this.service.search(this.searchQuery()));

  protected readonly createMode = signal(false);
  protected readonly newName = signal('');
  protected readonly createError = signal('');
  protected readonly pendingDeleteId = signal<string | null>(null);

  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly notice = signal('');

  ngOnInit(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      this.service.load();
    } catch {
      // Watchlists live in local storage, not on the network: a failure here
      // means the stored state is unreadable, never a dropped HTTP call.
      this.errorMessage.set('Could not load your watchlists. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  protected stockCount(id: string): number {
    return this.watchlists().find((list) => list.id === id)?.symbols.length ?? 0;
  }

  protected onSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.onSwitch(id);
  }

  protected onSwitch(id: string): void {
    this.service.select(id);
    this.pendingDeleteId.set(null);
    this.notice.set('');
  }

  protected toggleCreate(): void {
    this.createMode.update((open) => !open);
    this.createError.set('');
    this.newName.set('');
  }

  protected create(event: Event): void {
    event.preventDefault();
    this.createError.set('');
    try {
      const created = this.service.createWatchlist(this.newName());
      this.createMode.set(false);
      this.newName.set('');
      this.notice.set(`Watchlist “${created.name}” created.`);
    } catch (err) {
      this.createError.set(err instanceof Error ? err.message : 'Could not create the watchlist.');
    }
  }

  protected requestDelete(id: string): void {
    this.pendingDeleteId.set(id);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  protected confirmDelete(): void {
    const id = this.pendingDeleteId();
    if (!id) {
      return;
    }
    const target = this.watchlists().find((list) => list.id === id);
    const removed = this.service.deleteWatchlist(id);
    this.pendingDeleteId.set(null);
    if (removed && target) {
      this.notice.set(`Watchlist “${target.name}” deleted.`);
    }
  }

  protected add(symbol: string): void {
    this.notice.set('');
    try {
      const result = this.service.addToSelected(symbol);
      const name = this.selected()?.name ?? 'watchlist';
      this.notice.set(
        result === 'added' ? `${symbol.trim().toUpperCase()} added to “${name}”.` : 'Already in watchlist'
      );
    } catch (err) {
      this.notice.set(err instanceof Error ? err.message : 'Could not add the stock.');
    }
  }

  protected remove(symbol: string): void {
    this.service.removeFromSelected(symbol);
    this.notice.set(`${symbol.trim().toUpperCase()} removed from “${this.selected()?.name ?? 'watchlist'}”.`);
  }
}
