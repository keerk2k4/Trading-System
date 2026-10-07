import { Component, input } from '@angular/core';

/**
 * Tells a suspended customer, before they try, that orders will be refused.
 *
 * A SUSPENDED account can sign in and read its account, but the Trade REST API
 * accepts orders from ACTIVE accounts only, so every order comes back ACC-403.
 * Nothing is disabled here: the backend stays the one that refuses, and this
 * only says so in advance. Renders nothing for any other status.
 */
@Component({
  selector: 'app-account-status-notice',
  template: `
    @if (status() === 'SUSPENDED') {
      <div class="tp-alert tp-alert-info" role="status" data-testid="account-suspended-notice">
        <span>
          <strong>Your account is suspended.</strong>
          You can still view your account, but new orders will be refused. Please contact support.
        </span>
      </div>
    }
  `
})
export class AccountStatusNoticeComponent {
  readonly status = input<string | null | undefined>(null);
}
