import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WatchlistService } from '../../shared/services/watchlist.service';

/**
 * Watchlist page: switch between the seeded default list and user-created
 * lists, search stocks by company name or symbol, add them to the selected
 * list (duplicates are refused), and remove them again.
 */
@Component({
  selector: 'app-watchlist',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
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

      <div>
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
            @if (createMode()) {
              <form class="wl-create" (submit)="create($event)">
                <label class="tp-label" for="wl-name">New watchlist name</label>
                <div class="wl-create-row">
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
                  <div class="tp-actions">
                    <button class="tp-btn tp-btn-primary" type="submit" data-testid="watchlist-create">
                      Create
                    </button>
                    <button class="tp-btn tp-btn-secondary" type="button" (click)="toggleCreate()">Cancel</button>
                  </div>
                </div>
                @if (createError(); as message) {
                  <p class="tp-field-error" role="alert">{{ message }}</p>
                }
              </form>
            }
            <div class="wl-tabs" role="group" aria-label="Watchlists">
              @for (list of watchlists(); track list.id) {
                <button
                  type="button"
                  class="wl-tab"
                  data-testid="watchlist-switch"
                  [attr.data-list]="list.id"
                  [class.is-active]="list.id === selected()?.id"
                  [attr.aria-current]="list.id === selected()?.id ? 'true' : null"
                  (click)="onSwitch(list.id)"
                >
                  <span class="wl-tab-name">{{ list.name }}</span>
                  <span class="wl-tab-count tp-num">{{ stockCount(list.id) }}</span>
                </button>
              }
            </div>
            <p class="tp-hint">The Default list cannot be deleted. Select a list to view its stocks.</p>
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
                          <a
                            class="wl-trade-link"
                            routerLink="/orders/new"
                            [queryParams]="{ symbol: stock.symbol }"
                            [attr.aria-label]="'Trade ' + stock.symbol + ' (' + stock.companyName + ')'"
                            data-testid="trade-stock"
                            [attr.data-symbol]="stock.symbol"
                            ><strong>{{ stock.symbol }}</strong></a
                          >
                        </td>
                        <td>
                          <a
                            class="wl-trade-link"
                            routerLink="/orders/new"
                            [queryParams]="{ symbol: stock.symbol }"
                            [attr.aria-label]="'Trade ' + stock.symbol + ' (' + stock.companyName + ')'"
                            data-testid="trade-stock"
                            [attr.data-symbol]="stock.symbol"
                            >{{ stock.companyName }}</a
                          >
                        </td>
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
      .wl-create {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        margin-bottom: 1rem;
        padding: 1rem;
        border: 1px solid var(--tp-border);
        border-radius: var(--tp-radius);
        background-color: var(--tp-surface-raised);
      }
      .wl-create-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.625rem;
      }
      .wl-create-row .tp-input {
        flex: 1;
        min-width: 12rem;
      }
      .wl-tabs {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        padding: 0.25rem 0.125rem 0.5rem;
        margin-bottom: 0.25rem;
      }
      .wl-tab {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
        padding: 0.5rem 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        white-space: nowrap;
        color: var(--tp-text-muted);
        background-color: var(--tp-surface);
        border: 1px solid var(--tp-border);
        border-radius: 999px;
      }
      .wl-tab:hover {
        color: var(--tp-text);
        background-color: var(--tp-surface-raised);
      }
      .wl-tab.is-active {
        color: var(--tp-text);
        background-color: var(--tp-glow);
        border-color: var(--tp-accent);
        box-shadow: inset 0 -2px 0 var(--tp-accent);
      }
      .wl-tab:focus-visible {
        outline: 2px solid var(--tp-focus);
        outline-offset: 2px;
      }
      .wl-tab-count {
        display: inline-grid;
        place-items: center;
        min-width: 1.5rem;
        padding: 0 0.375rem;
        font-size: 0.75rem;
        border-radius: 999px;
        background-color: color-mix(in srgb, currentColor 12%, transparent);
      }
      .wl-trade-link {
        color: inherit;
        text-decoration: none;
        border-radius: 0.125rem;
      }
      .wl-trade-link:hover {
        color: var(--tp-link);
        text-decoration: underline;
        text-underline-offset: 0.2em;
      }
      .wl-trade-link:focus-visible {
        outline: 2px solid var(--tp-focus);
        outline-offset: 2px;
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
  protected readonly pendingDeleteId = signal<string | number | null>(null);

  protected readonly isLoading = this.service.isLoading;
  protected readonly errorMessage = signal('');
  protected readonly notice = signal('');

  ngOnInit(): void {
    this.errorMessage.set('');
    this.service.load();
  }

  protected stockCount(id: string | number): number {
    return this.watchlists().find((list) => String(list.id) === String(id))?.symbols.length ?? 0;
  }

  protected onSwitch(id: string | number): void {
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
    this.service.createWatchlist(this.newName()).subscribe({
      next: (created) => {
        this.createMode.set(false);
        this.newName.set('');
        this.notice.set(`Watchlist “${created.name}” created.`);
      },
      error: (err) => {
        this.createError.set(err instanceof Error ? err.message : 'Could not create the watchlist.');
      }
    });
  }

  protected requestDelete(id: string | number): void {
    this.pendingDeleteId.set(id);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  protected confirmDelete(): void {
    const id = this.pendingDeleteId();
    if (id === null || id === undefined) {
      return;
    }
    const target = this.watchlists().find((list) => String(list.id) === String(id));
    this.service.deleteWatchlist(id).subscribe({
      next: (removed) => {
        this.pendingDeleteId.set(null);
        if (removed && target) {
          this.notice.set(`Watchlist “${target.name}” deleted.`);
        } else if (!removed) {
          this.notice.set('Could not delete the watchlist.');
        }
      },
      error: () => {
        this.pendingDeleteId.set(null);
        this.notice.set('Could not delete the watchlist.');
      }
    });
  }

  protected add(symbol: string): void {
    this.notice.set('');
    this.service.addToSelected(symbol).subscribe({
      next: (result) => {
        const name = this.selected()?.name ?? 'watchlist';
        this.notice.set(
          result === 'added' ? `${symbol.trim().toUpperCase()} added to “${name}”.` : 'Already in watchlist'
        );
      },
      error: (err) => {
        this.notice.set(err instanceof Error ? err.message : 'Could not add the stock.');
      }
    });
  }

  protected remove(symbol: string): void {
    this.service.removeFromSelected(symbol);
    this.notice.set(`${symbol.trim().toUpperCase()} removed from “${this.selected()?.name ?? 'watchlist'}”.`);
  }
}
