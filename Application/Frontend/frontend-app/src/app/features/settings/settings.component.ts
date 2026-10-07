import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { Account, AlertChannel, Preferences, TradeApiError } from '../../shared/models/order.models';

const CHANNELS: { value: AlertChannel; label: string; hint: string }[] = [
  { value: 'EMAIL', label: 'Email', hint: 'Order outcomes by email' },
  { value: 'SMS', label: 'SMS', hint: 'Order outcomes by text message' },
  { value: 'PUSH', label: 'Push', hint: 'Order outcomes as push messages' }
];

/**
 * Customer settings: default account and alert channel. The account list
 * comes from the account API (never hardcoded); with one account per
 * customer the dropdown holds that account, and the backend validates that
 * a saved default belongs to the caller. The channel is what notifications
 * resolve on every send.
 */
@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Settings</h1>
          <p>Your default account and how order outcomes reach you.</p>
        </div>
      </header>

      <section class="tp-panel" aria-labelledby="settings-heading" [attr.aria-busy]="isLoading()">
        <div class="tp-panel-header">
          <h2 id="settings-heading">Preferences</h2>
        </div>
        <div class="tp-panel-body">
          @if (isLoading()) {
            <p class="tp-empty">Loading preferences…</p>
          } @else {
            <form class="tp-form" (ngSubmit)="onSave()">
              @if (errorMessage(); as message) {
                <div class="tp-alert tp-alert-error" role="alert" data-testid="settings-error"><span>{{ message }}</span></div>
              }
              @if (successMessage(); as message) {
                <div class="tp-alert tp-alert-success" role="status" data-testid="settings-success"><span>{{ message }}</span></div>
              }

              <div>
                <label class="tp-label" for="default-account">Default account</label>
                <select
                  class="tp-input"
                  id="default-account"
                  data-testid="settings-default-account"
                  [(ngModel)]="defaultAccountId"
                  name="defaultAccountId"
                >
                  @for (id of accountOptions(); track id) {
                    <option [ngValue]="id">{{ accountLabel(id) }}</option>
                  }
                </select>
                <p class="tp-hint">The account the application opens on. Only your own accounts are listed.</p>
              </div>

              <fieldset class="tp-segmented">
                <legend class="tp-label">Alert channel</legend>
                <div class="tp-segmented-options is-full">
                  @for (channel of channels; track channel.value) {
                    <input
                      type="radio"
                      [id]="'channel-' + channel.value"
                      name="alertChannel"
                      [value]="channel.value"
                      [(ngModel)]="alertChannel"
                      [attr.data-testid]="'settings-channel-' + channel.value"
                    />
                    <label [for]="'channel-' + channel.value">{{ channel.label }}</label>
                  }
                </div>
                <p class="tp-hint">{{ channelHint() }}</p>
              </fieldset>

              <button
                class="tp-btn tp-btn-primary tp-btn-block"
                data-testid="settings-save"
                type="submit"
                [attr.aria-disabled]="isSaving() ? 'true' : null"
              >
                {{ isSaving() ? 'Saving…' : 'Save preferences' }}
              </button>
            </form>
          }
        </div>
      </section>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly channels = CHANNELS;
  protected readonly account = signal<Account | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');

  protected defaultAccountId: number | null = null;
  protected alertChannel: AlertChannel = 'EMAIL';

  protected readonly accountOptions = computed(() => {
    const id = this.account()?.id;
    return id ? [id] : [];
  });

  protected readonly channelHint = computed(
    () => this.channels.find((c) => c.value === this.alertChannel)?.hint ?? ''
  );

  ngOnInit(): void {
    this.tradeApi
      .getAccount()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          if (this.defaultAccountId === null) {
            this.defaultAccountId = account.id;
          }
          this.loadPreferences(account.id);
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.mapError(err));
        }
      });
  }

  protected accountLabel(id: number): string {
    const acc = this.account();
    return acc && acc.id === id ? `${acc.accountId} · ${acc.holderName}` : `Account ${id}`;
  }

  protected onSave(): void {
    if (this.isSaving()) {
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.tradeApi
      .updatePreferences({
        ...(this.defaultAccountId !== null ? { defaultAccountId: this.defaultAccountId } : {}),
        alertChannel: this.alertChannel
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.isSaving.set(false);
          this.defaultAccountId = saved.defaultAccountId ?? this.defaultAccountId;
          this.alertChannel = saved.alertChannel;
          this.successMessage.set('Preferences saved.');
        },
        error: (err: TradeApiError) => {
          this.isSaving.set(false);
          this.errorMessage.set(this.mapError(err));
        }
      });
  }

  private loadPreferences(fallbackAccountId: number): void {
    this.tradeApi
      .getPreferences()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (prefs: Preferences) => {
          this.isLoading.set(false);
          this.defaultAccountId = prefs.defaultAccountId ?? fallbackAccountId;
          this.alertChannel = prefs.alertChannel;
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.mapError(err));
        }
      });
  }

  private mapError(err: TradeApiError): string {
    return this.errorMapping.isNetworkError(err.status)
      ? this.errorMapping.getNetworkErrorMessage()
      : this.errorMapping.getErrorMessage(err.errorCode);
  }
}
