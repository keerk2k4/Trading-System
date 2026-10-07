import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { ErrorMappingService } from '../../shared/services/error-mapping.service';
import { MockAuthService } from '../../shared/services/auth.service';
import { Account, AlertChannel, Preferences, TradeApiError } from '../../shared/models/order.models';

interface Contact {
  email: string;
  phone: string | null;
}

/**
 * The two ways a customer can be alerted. Every notification shows in the app
 * (a toast and the inbox); EMAIL adds an email. SMS stays valid in the API but
 * is not offered, so a stored SMS preference shows neither option chosen.
 */
const CHANNELS: { value: AlertChannel; label: string }[] = [
  { value: 'PUSH', label: 'In app only' },
  { value: 'EMAIL', label: 'In app and email' }
];

/**
 * Customer settings: default account, how alerts reach the customer, and the
 * contact details they go to. The account list comes from the account API
 * (never hardcoded); with one account per customer the dropdown holds that
 * account, and the backend validates that a saved default belongs to the
 * caller. The channel is what notifications resolve on every send. Contact
 * details are read from Auth on demand and never stored here.
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
                <legend class="tp-label">Alerts</legend>
                <div class="tp-segmented-options is-full">
                  @for (channel of channels; track channel.value) {
                    <input
                      type="radio"
                      [id]="'channel-' + channel.value"
                      name="alertChannel"
                      [value]="channel.value"
                      [ngModel]="alertChannel()"
                      (ngModelChange)="alertChannel.set($event)"
                      [attr.data-testid]="'settings-channel-' + channel.value"
                    />
                    <label [for]="'channel-' + channel.value">{{ channel.label }}</label>
                  }
                </div>
                <p class="tp-hint" data-testid="settings-channel-hint">{{ channelHint() }}</p>
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

      <section class="tp-panel" aria-labelledby="contact-heading" data-testid="settings-contact">
        <div class="tp-panel-header">
          <div>
            <h2 id="contact-heading">Contact details</h2>
            <p>Where alert emails go.</p>
          </div>
        </div>
        <div class="tp-panel-body">
          @if (contact(); as details) {
            <dl class="contact">
              <div>
                <dt>Email</dt>
                <dd data-testid="settings-email">{{ details.email }}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd data-testid="settings-phone">
                  @if (details.phone) {
                    {{ details.phone }}
                  } @else {
                    <span class="tp-muted">Not provided</span>
                  }
                </dd>
              </div>
            </dl>
          } @else if (contactError()) {
            <p class="tp-muted" data-testid="settings-contact-error">Your contact details couldn't be loaded. Try again later.</p>
          } @else {
            <p class="tp-muted">Loading contact details…</p>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .contact { display: grid; gap: 1rem; margin: 0; }
    .contact dt { font-size: 0.8125rem; color: var(--tp-text-muted); }
    .contact dd { margin: 0.125rem 0 0; font-weight: 600; overflow-wrap: anywhere; }
    @media (min-width: 36rem) { .contact { grid-template-columns: 1fr 1fr; } }
  `]
})
export class SettingsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApiService);
  private readonly auth = inject(MockAuthService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly channels = CHANNELS;
  protected readonly account = signal<Account | null>(null);
  protected readonly contact = signal<Contact | null>(null);
  protected readonly contactError = signal(false);
  protected readonly isLoading = signal(true);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly alertChannel = signal<AlertChannel | null>('PUSH');

  protected defaultAccountId: number | null = null;

  protected readonly accountOptions = computed(() => {
    const id = this.account()?.id;
    return id ? [id] : [];
  });

  protected readonly channelHint = computed(() => {
    switch (this.alertChannel()) {
      case 'PUSH':
        return 'Alerts pop up in the app and stay in your inbox. Nothing is emailed.';
      case 'EMAIL': {
        const email = this.contact()?.email;
        return `Alerts pop up in the app and stay in your inbox, and are also emailed${email ? ` to ${email}` : ''}.`;
      }
      default:
        return 'Choose how you want to be alerted.';
    }
  });

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

    this.auth
      .getContact()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (contact) => this.contact.set({ email: contact.email, phone: contact.phone ?? null }),
        error: () => this.contactError.set(true)
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
    this.errorMessage.set('');
    this.successMessage.set('');
    const channel = this.alertChannel();
    if (!channel) {
      this.errorMessage.set('Choose how you want to be alerted.');
      return;
    }
    this.isSaving.set(true);
    this.tradeApi
      .updatePreferences({
        ...(this.defaultAccountId !== null ? { defaultAccountId: this.defaultAccountId } : {}),
        alertChannel: channel
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.isSaving.set(false);
          this.defaultAccountId = saved.defaultAccountId ?? this.defaultAccountId;
          this.alertChannel.set(this.offered(saved.alertChannel));
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
          this.alertChannel.set(this.offered(prefs.alertChannel));
        },
        error: (err: TradeApiError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.mapError(err));
        }
      });
  }

  /** A stored channel that is no longer offered (SMS) leaves the choice open. */
  private offered(channel: AlertChannel): AlertChannel | null {
    return CHANNELS.some((c) => c.value === channel) ? channel : null;
  }

  private mapError(err: TradeApiError): string {
    return this.errorMapping.isNetworkError(err.status)
      ? this.errorMapping.getNetworkErrorMessage()
      : this.errorMapping.getErrorMessage(err.errorCode);
  }
}
