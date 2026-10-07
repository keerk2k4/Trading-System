import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {  DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { Notification, TradeApiError } from '../../shared/models/order.models';

/**
 * Notification inbox: the backend history is the source of truth, newest
 * first. A rejection is news too, so every outcome kind is listed.
 */
@Component({
  selector: 'app-notifications',
  imports: [RouterLink, DatePipe, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Notifications</h1>
          <p>Order fills, rejections, cancellations and price alerts on your channel.</p>
        </div>
        <div class="tp-actions">
          <button
            class="tp-btn tp-btn-secondary"
            type="button"
            data-testid="notifications-refresh"
            [attr.aria-disabled]="isLoading() ? 'true' : null"
            (click)="refresh()"
          >
            {{ isLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
          <a class="tp-btn tp-btn-primary" routerLink="/settings" data-testid="notifications-to-settings">Notification settings</a>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="notifications-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header">
          <div>
            <h2 id="notifications-heading">Inbox</h2>
            <p class="tp-num" role="status" data-testid="notifications-count">
              {{ isLoading() ? 'Loading notifications…' : notifications().length + (notifications().length === 1 ? ' notification' : ' notifications') }}
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
          <ul class="tp-list" data-testid="notifications-list">
            @for (notification of notifications(); track notification.notificationId) {
              <li class="tp-list-row" data-testid="notification-row" [attr.data-event-id]="notification.eventId">
                <div class="tp-list-main">
                  <strong>{{ notification.title }}</strong>
                  <span class="tp-muted">{{ notification.message }}</span>
                  <span class="tp-muted tp-num">{{ notification.createdOn | date: 'MMM d, y, h:mm a' }}</span>
                </div>
                <div class="tp-list-side">
                  <app-status-badge data-testid="notification-type" [status]="notification.type" />
                  <span class="tp-muted" data-testid="notification-channel">Channel: {{ notification.channel }}</span>
                  <app-status-badge data-testid="notification-status" [status]="notification.status" />
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `
})
export class NotificationsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly notifications = signal<Notification[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected refresh(): void {
    if (!this.isLoading()) {
      this.load();
    }
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
