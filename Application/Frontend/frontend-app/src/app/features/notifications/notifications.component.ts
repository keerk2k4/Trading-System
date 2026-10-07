import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { AlertChannel, Notification, TradeApiError } from '../../shared/models/order.models';
import { NotificationKind, notificationKind } from '../../shared/ui/notification-kinds';

const CHANNEL_WORDS: Record<AlertChannel, string> = {
  EMAIL: 'by email',
  SMS: 'by SMS',
  PUSH: 'as an in-app alert'
};

interface DayGroup {
  key: string;
  label: string;
  items: Notification[];
}

/**
 * Notification inbox: the backend history is the source of truth, newest
 * first, grouped by day. A rejection is news too, so every outcome kind is
 * listed, and each row says in words whether it reached the customer's channel.
 */
@Component({
  selector: 'app-notifications',
  imports: [RouterLink, DatePipe],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Notifications</h1>
          <p>Order fills, rejections, cancellations and price alerts, newest first.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary tp-btn-icon-refresh"
            data-icon
            type="button"
            data-testid="notifications-refresh"
            [attr.aria-disabled]="isLoading() ? 'true' : null"
            (click)="refresh()"
          >
            {{ isLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-secondary" routerLink="/settings" data-testid="notifications-to-settings">Notification settings</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="notifications-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header">
          <div>
            <h2 id="notifications-heading">Inbox</h2>
            <p class="tp-num" role="status" data-testid="notifications-count">
              {{ isLoading() ? 'Loading notifications…' : countLabel() }}
            </p>
          </div>
        </div>

        @if (errorMessage(); as message) {
          <div class="tp-panel-body">
            <div class="tp-alert tp-alert-error" role="alert" data-testid="notifications-error"><span>{{ message }}</span></div>
          </div>
        } @else if (notifications().length === 0) {
          @if (!isLoading()) {
            <div class="tp-empty" data-testid="notifications-empty">
              <strong>No notifications yet</strong>
              Place an order and its outcome will arrive here.
            </div>
          }
        } @else {
          <div data-testid="notifications-list">
            @for (group of groups(); track group.key) {
              <section class="day" [attr.aria-labelledby]="'day-' + group.key">
                <h3 class="day-label" [id]="'day-' + group.key" data-testid="notifications-day">{{ group.label }}</h3>
                <ul class="inbox">
                  @for (notification of group.items; track notification.notificationId) {
                    <li class="item" data-testid="notification-row" [attr.data-event-id]="notification.eventId">
                      <span class="tp-kind" [class]="'tp-kind is-' + kind(notification).tone" aria-hidden="true">
                        <svg viewBox="0 0 20 20"><path [attr.d]="kind(notification).icon" /></svg>
                      </span>
                      <div class="body">
                        <div class="head">
                          <span class="sr-only" data-testid="notification-type">{{ kind(notification).label }}:</span>
                          <strong class="title">{{ notification.title }}</strong>
                          <time
                            class="time tp-muted tp-num"
                            [attr.datetime]="notification.createdOn"
                            [title]="notification.createdOn | date: 'EEEE d MMMM y, h:mm a'"
                          >{{ notification.createdOn | date: 'h:mm a' }}</time>
                        </div>
                        <p class="message">{{ notification.message }}</p>
                        <p
                          class="delivery"
                          [class.is-failed]="notification.status === 'FAILED'"
                          [class.is-queued]="notification.status === 'QUEUED'"
                          data-testid="notification-status"
                        >
                          <span data-testid="notification-channel">{{ deliveryText(notification) }}</span>
                        </p>
                      </div>
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    .day + .day { border-top: 1px solid var(--tp-border); }
    .day-label {
      margin: 0;
      padding: 0.625rem 1.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--tp-text-muted);
      background-color: var(--tp-surface-raised);
      border-bottom: 1px solid var(--tp-border);
    }
    .inbox { list-style: none; margin: 0; padding: 0; }
    .item { display: flex; gap: 0.875rem; padding: 1rem 1.25rem; }
    .item + .item { border-top: 1px solid var(--tp-border); }

    .body { flex: 1; min-width: 0; }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.25rem 1rem; flex-wrap: wrap; }
    .title { font-size: 0.9375rem; }
    .time { font-size: 0.8125rem; white-space: nowrap; }
    .message { margin: 0.25rem 0 0; color: var(--tp-text); overflow-wrap: anywhere; }
    .delivery { margin: 0.375rem 0 0; font-size: 0.8125rem; color: var(--tp-text-muted); }
    .delivery.is-queued { color: var(--tp-warning); }
    .delivery.is-failed { color: var(--tp-negative); font-weight: 600; }
  `]
})
export class NotificationsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly notifications = signal<Notification[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly countLabel = computed(() => {
    const n = this.notifications().length;
    return `${n} ${n === 1 ? 'notification' : 'notifications'}`;
  });

  /** Newest first, one group per local calendar day. */
  protected readonly groups = computed<DayGroup[]>(() => {
    const today = this.dayKey(new Date());
    const yesterday = this.dayKey(new Date(Date.now() - 86_400_000));
    const groups: DayGroup[] = [];
    for (const notification of this.notifications()) {
      const created = new Date(notification.createdOn);
      const key = this.dayKey(created);
      let group = groups.at(-1);
      if (!group || group.key !== key) {
        const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : formatDate(created, 'EEE d MMM y', 'en-US');
        group = { key, label, items: [] };
        groups.push(group);
      }
      group.items.push(notification);
    }
    return groups;
  });

  ngOnInit(): void {
    this.load();
  }

  protected refresh(): void {
    if (!this.isLoading()) {
      this.load();
    }
  }

  protected kind(notification: Notification): NotificationKind {
    return notificationKind(notification);
  }

  /** Where the message went, in words: the status and the resolved channel together. */
  protected deliveryText(notification: Notification): string {
    const channel = CHANNEL_WORDS[notification.channel] ?? `by ${String(notification.channel).toLowerCase()}`;
    switch (notification.status) {
      case 'SENT':
        return `Sent ${channel}`;
      case 'QUEUED':
        return `Waiting to send ${channel}`;
      case 'FAILED':
        return `Couldn't send ${channel}. It's still here in your inbox.`;
      default:
        return channel.charAt(0).toUpperCase() + channel.slice(1);
    }
  }

  private dayKey(date: Date): string {
    return formatDate(date, 'yyyy-MM-dd', 'en-US');
  }

  private load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.tradeApi
      .getNotifications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (notifications) => {
          this.notifications.set([...notifications].sort(
            (a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
          ));
          this.isLoading.set(false);
        },
        error: (err: TradeApiError) => {
          this.notifications.set([]);
          this.isLoading.set(false);
          this.errorMessage.set(
            this.errorMapping.isNetworkError(err.status)
              ? this.errorMapping.getNetworkErrorMessage()
              : this.errorMapping.getErrorMessage(err.errorCode)
          );
        }
      });
  }
}
