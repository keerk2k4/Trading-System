import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import {
  EMPTY,
  Subject,
  catchError,
  distinctUntilChanged,
  exhaustMap,
  finalize,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
  timer
} from 'rxjs';
import { ServiceHealthService } from '../../../shared/services/service-health.service';
import { PlatformHealthView } from '../../../shared/models/service-health.models';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';

/** How often the screen re-checks while it is on show. */
export const REFRESH_MS = 30_000;

/**
 * Admin "Service health": one card per service, an overall banner, and a
 * re-check every 30 seconds that pauses while the browser tab is hidden, so an
 * admin who leaves the tab open is not a load test nobody meant to run.
 */
@Component({
  selector: 'app-service-health',
  imports: [DatePipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Service health</h1>
          <p>Every service the platform depends on. Re-checked every 30 seconds while this tab is open.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary"
            type="button"
            data-testid="health-check-now"
            [attr.aria-disabled]="isChecking() ? 'true' : null"
            (click)="checkNow()"
          >
            @if (isChecking()) {
              <span class="tp-spinner" aria-hidden="true"></span>
              Checking…
            } @else {
              Check now
            }
          </button>
        </div>
      </header>

      @if (view(); as health) {
        @if (health.overall === 'UP') {
          <div class="tp-alert tp-alert-success" data-testid="health-overall"><span>All systems operational.</span></div>
        } @else {
          <div class="tp-alert tp-alert-error" data-testid="health-overall"><span>{{ attentionText() }}</span></div>
        }
        <p class="tp-hint" data-testid="health-checked-at">Last checked at {{ health.checkedAt | date: 'HH:mm:ss' }}</p>

        <section class="tp-grid tp-grid-2" aria-label="Services">
          @for (service of health.services; track service.name) {
            <article
              class="tp-panel"
              data-testid="health-card"
              [attr.data-service]="service.name"
              [attr.aria-labelledby]="headingId(service.name)"
            >
              <div class="tp-panel-header card-header">
                <h2 [id]="headingId(service.name)">{{ service.name }}</h2>
                <app-status-badge data-testid="health-status" [status]="service.status" />
              </div>
              <div class="tp-panel-body">
                <p data-testid="health-detail">{{ service.detail }}</p>
                <dl class="tp-details">
                  <div>
                    <dt>Response time</dt>
                    <dd class="tp-num">{{ service.responseMs === null ? '—' : service.responseMs + ' ms' }}</dd>
                  </div>
                  @for (fact of service.facts; track fact.label) {
                    <div>
                      <dt>{{ fact.label }}</dt>
                      <dd class="tp-num">{{ fact.value }}</dd>
                    </div>
                  }
                </dl>
                <p class="tp-hint">{{ service.checkedBy }}</p>
              </div>
            </article>
          }
        </section>
      } @else {
        <p class="tp-muted" aria-busy="true" data-testid="health-loading">Checking services…</p>
      }

      <span class="sr-only" role="status">{{ announcement() }}</span>
    </div>
  `,
  styles: [`
    .card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  `]
})
export class ServiceHealthComponent {
  private readonly health = inject(ServiceHealthService);
  private readonly document = inject(DOCUMENT);
  private readonly checkNow$ = new Subject<void>();

  protected readonly view = signal<PlatformHealthView | null>(null);
  protected readonly isChecking = signal(false);

  protected readonly attentionText = computed(() => {
    const count = this.view()?.services.filter((service) => service.status !== 'UP').length ?? 0;
    return count === 1 ? '1 service needs attention.' : `${count} services need attention.`;
  });
  // Only changes of wording are read out, so an unchanged state is not
  // re-announced every 30 seconds.
  protected readonly announcement = computed(() => {
    const health = this.view();
    if (!health) {
      return '';
    }
    return health.overall === 'UP' ? 'All systems operational.' : this.attentionText();
  });

  constructor() {
    const visible$ = fromEvent(this.document, 'visibilitychange').pipe(
      startWith(null),
      map(() => this.document.visibilityState !== 'hidden'),
      distinctUntilChanged()
    );
    // Visible: check at once, then every REFRESH_MS. Hidden: no checks at all.
    const scheduled$ = visible$.pipe(switchMap((visible) => (visible ? timer(0, REFRESH_MS) : EMPTY)));

    merge(scheduled$, this.checkNow$)
      .pipe(
        // A check already running absorbs further ticks and clicks.
        exhaustMap(() => {
          this.isChecking.set(true);
          return this.health.check().pipe(
            catchError(() => EMPTY),
            finalize(() => this.isChecking.set(false))
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((view) => this.view.set(view));
  }

  protected checkNow(): void {
    if (!this.isChecking()) {
      this.checkNow$.next();
    }
  }

  protected headingId(name: string): string {
    return `service-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  }
}
