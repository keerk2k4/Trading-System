import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthError } from '../../../shared/models/auth.models';
import { MockAuthService } from '../../../shared/services/auth.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';

type Step = 'request' | 'verify' | 'reset' | 'done';

function matchesNewPassword(control: AbstractControl): ValidationErrors | null {
  const password: unknown = control.parent?.get('newPassword')?.value;
  return control.value === password ? null : { mismatch: true };
}

// Three steps against the auth-service: username -> emailed code -> new
// password. The code goes to the address given at registration.
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell [heading]="heading()" [subtitle]="subtitle()">
      @if (errorMessage(); as message) {
        <div class="tp-alert tp-alert-error" role="alert" data-testid="forgot-error">
          <span>{{ message }}</span>
        </div>
      }

      @switch (step()) {
        @case ('request') {
          <form class="tp-form" [formGroup]="requestForm" (ngSubmit)="sendCode()">
            <div>
              <label class="tp-label" for="forgot-username">Username</label>
              <input
                class="tp-input"
                id="forgot-username"
                data-testid="forgot-username"
                type="text"
                formControlName="username"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                aria-required="true"
                [attr.aria-invalid]="usernameError() ? 'true' : null"
                [attr.aria-describedby]="usernameError() ? 'forgot-username-error' : 'forgot-username-hint'"
              />
              @if (usernameError(); as message) {
                <p class="tp-field-error" id="forgot-username-error" data-testid="forgot-username-error">{{ message }}</p>
              } @else {
                <p class="tp-hint" id="forgot-username-hint">
                  We will email a verification code to the address you registered with.
                </p>
              }
            </div>

            <button class="tp-btn tp-btn-primary tp-btn-block" data-testid="forgot-send-code" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
              @if (isLoading()) {
                <span class="tp-spinner" aria-hidden="true"></span>
                Sending code…
              } @else {
                Send verification code
              }
            </button>
          </form>
        }

        @case ('verify') {
          <form class="tp-form" [formGroup]="verifyForm" (ngSubmit)="verifyCode()">
            <div class="tp-alert tp-alert-info" role="status" data-testid="forgot-code-sent">
              <span>{{ infoMessage() }}</span>
            </div>

            <div>
              <label class="tp-label" for="forgot-otp">Verification code</label>
              <input
                class="tp-input"
                id="forgot-otp"
                data-testid="forgot-otp"
                type="text"
                inputmode="numeric"
                maxlength="6"
                formControlName="otp"
                autocomplete="one-time-code"
                aria-required="true"
                [attr.aria-invalid]="otpError() ? 'true' : null"
                [attr.aria-describedby]="otpError() ? 'forgot-otp-error' : 'forgot-otp-hint'"
              />
              @if (otpError(); as message) {
                <p class="tp-field-error" id="forgot-otp-error" data-testid="forgot-otp-error">{{ message }}</p>
              } @else {
                <p class="tp-hint" id="forgot-otp-hint">Enter the 6-digit code. It expires in 10 minutes.</p>
              }
            </div>

            <button class="tp-btn tp-btn-primary tp-btn-block" data-testid="forgot-verify-code" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
              @if (isLoading()) {
                <span class="tp-spinner" aria-hidden="true"></span>
                Verifying…
              } @else {
                Verify code
              }
            </button>

            <div class="forgot-actions">
              <button
                class="tp-btn tp-btn-secondary"
                type="button"
                data-testid="forgot-resend-code"
                [attr.aria-disabled]="resendCountdown() > 0 || isLoading() ? 'true' : null"
                (click)="resendCode()"
              >
                {{ resendCountdown() > 0 ? 'Resend code in ' + resendCountdown() + 's' : 'Resend code' }}
              </button>
              <button class="tp-btn tp-btn-secondary" type="button" data-testid="forgot-change-username" (click)="startOver()">
                Use a different username
              </button>
            </div>
          </form>
        }

        @case ('reset') {
          <form class="tp-form" [formGroup]="resetForm" (ngSubmit)="changePassword()">
            <div>
              <label class="tp-label" for="forgot-new-password">New password</label>
              <div class="tp-input-wrap">
                <input
                  class="tp-input"
                  id="forgot-new-password"
                  data-testid="forgot-new-password"
                  [type]="passwordsVisible() ? 'text' : 'password'"
                  formControlName="newPassword"
                  autocomplete="new-password"
                  aria-required="true"
                  [attr.aria-invalid]="newPasswordError() ? 'true' : null"
                  [attr.aria-describedby]="newPasswordError() ? 'forgot-new-password-error' : 'forgot-new-password-hint'"
                />
                <button
                  class="tp-input-action"
                  type="button"
                  [class.is-active]="passwordsVisible()"
                  data-testid="forgot-toggle-password"
                  [attr.aria-label]="passwordsVisible() ? 'Hide passwords' : 'Show passwords'"
                  (click)="passwordsVisible.set(!passwordsVisible())"
                ></button>
              </div>
              @if (newPasswordError(); as message) {
                <p class="tp-field-error" id="forgot-new-password-error" data-testid="forgot-new-password-error">{{ message }}</p>
              } @else {
                <p class="tp-hint" [class.is-met]="resetForm.controls.newPassword.value.length >= 12" id="forgot-new-password-hint">
                  At least 12 characters.
                </p>
              }
            </div>

            <div>
              <label class="tp-label" for="forgot-confirm-password">Confirm new password</label>
              <input
                class="tp-input"
                id="forgot-confirm-password"
                data-testid="forgot-confirm-password"
                [type]="passwordsVisible() ? 'text' : 'password'"
                formControlName="confirmPassword"
                autocomplete="new-password"
                aria-required="true"
                [attr.aria-invalid]="confirmPasswordError() ? 'true' : null"
                [attr.aria-describedby]="confirmPasswordError() ? 'forgot-confirm-password-error' : null"
              />
              @if (confirmPasswordError(); as message) {
                <p class="tp-field-error" id="forgot-confirm-password-error" data-testid="forgot-confirm-password-error">{{ message }}</p>
              }
            </div>

            <button class="tp-btn tp-btn-primary tp-btn-block" data-testid="forgot-change-password" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
              @if (isLoading()) {
                <span class="tp-spinner" aria-hidden="true"></span>
                Changing password…
              } @else {
                Change password
              }
            </button>
          </form>
        }

        @case ('done') {
          <div class="tp-form">
            <div class="tp-alert tp-alert-success" role="status" data-testid="forgot-success">
              <span>Your password has been changed and you have been signed out everywhere. Sign in with your new password.</span>
            </div>
            <a class="tp-btn tp-btn-primary tp-btn-block" routerLink="/login" data-testid="forgot-continue">Continue to sign in</a>
          </div>
        }
      }

      @if (step() !== 'done') {
        <p class="tp-form-footer">
          Remembered it? <a class="tp-link" routerLink="/login">Back to sign in</a>
        </p>
      }
    </app-auth-shell>
  `,
  styles: `
    .forgot-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .forgot-actions .tp-btn {
      flex: 1 1 auto;
    }
  `
})
export class ForgotPasswordComponent {
  private readonly authService = inject(MockAuthService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly shell = viewChild.required(AuthShellComponent);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly requestForm = this.fb.group({
    username: ['', [Validators.required, Validators.maxLength(64)]]
  });
  protected readonly verifyForm = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });
  // Same rules as registration's password field.
  protected readonly resetForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required, matchesNewPassword]]
  });

  protected readonly step = signal<Step>('request');
  protected readonly isLoading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly infoMessage = signal('');
  protected readonly otpError = signal('');
  protected readonly passwordsVisible = signal(false);
  protected readonly resendCountdown = signal(0);
  private resetToken: string | null = null;
  private countdownSub: Subscription | null = null;

  protected readonly heading = computed(() => (this.step() === 'done' ? 'Password changed' : 'Reset your password'));
  protected readonly subtitle = computed(() => {
    switch (this.step()) {
      case 'request':
        return 'Enter your username to receive a verification code by email.';
      case 'verify':
        return 'Check your email for the verification code.';
      case 'reset':
        return 'Choose a new password for your account.';
      default:
        return '';
    }
  });

  constructor() {
    this.resetForm.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.resetForm.controls.confirmPassword.updateValueAndValidity());
    this.destroyRef.onDestroy(() => this.countdownSub?.unsubscribe());
  }

  protected usernameError(): string | null {
    const control = this.requestForm.controls.username;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return control.hasError('required') ? 'Enter your username.' : 'Username must be 64 characters or fewer.';
  }

  protected newPasswordError(): string | null {
    const control = this.resetForm.controls.newPassword;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a new password.';
    }
    return control.hasError('minlength')
      ? 'Password must be at least 12 characters.'
      : 'Password must be 128 characters or fewer.';
  }

  protected confirmPasswordError(): string | null {
    const control = this.resetForm.controls.confirmPassword;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return control.hasError('required') ? 'Confirm your new password.' : 'Passwords do not match.';
  }

  protected sendCode(): void {
    if (this.isLoading()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.requestForm.invalid) {
      this.focus('#forgot-username');
      return;
    }
    this.requestCode(() => this.goTo('verify', '#forgot-otp'));
  }

  protected resendCode(): void {
    if (this.isLoading() || this.resendCountdown() > 0) {
      return;
    }
    this.errorMessage.set('');
    this.otpError.set('');
    this.verifyForm.reset();
    this.requestCode(() => this.focus('#forgot-otp'));
  }

  protected verifyCode(): void {
    if (this.isLoading()) {
      return;
    }
    this.errorMessage.set('');
    this.otpError.set('');
    const otp = this.verifyForm.controls.otp.value.trim();
    if (!/^\d{6}$/.test(otp)) {
      this.otpError.set('Enter the 6-digit code from the email.');
      this.focus('#forgot-otp');
      return;
    }

    this.isLoading.set(true);
    this.authService
      .verifyPasswordResetOtp(this.username(), otp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.resetToken = res.verificationToken;
          this.stopCountdown();
          this.submitted.set(false);
          this.goTo('reset', '#forgot-new-password');
        },
        error: (err: AuthError) => {
          this.isLoading.set(false);
          // An expired or burned code cannot be retried; allow an immediate resend.
          if (err.errorCode === 'OTP-410' || err.errorCode === 'OTP-429' || err.errorCode === 'OTP-404') {
            this.verifyForm.reset();
            this.stopCountdown();
          }
          this.otpError.set(this.messageFor(err, 'The code could not be verified. Please try again.'));
          this.focus('#forgot-otp');
        }
      });
  }

  protected changePassword(): void {
    if (this.isLoading()) {
      return;
    }
    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.resetForm.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }
    if (!this.resetToken) {
      this.startOver('Your reset session has expired. Request a new code.');
      return;
    }

    this.isLoading.set(true);
    this.authService
      .resetPassword(this.username(), this.resetToken, this.resetForm.controls.newPassword.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.resetToken = null;
          this.step.set('done');
          afterNextRender(() => this.shell().focusHeading(), { injector: this.injector });
        },
        error: (err: AuthError) => {
          this.isLoading.set(false);
          if (err.errorCode === 'OTP-403') {
            this.startOver(this.messageFor(err, 'Your reset session has expired. Request a new code.'));
            return;
          }
          this.errorMessage.set(this.messageFor(err, 'Your password could not be changed. Please try again.'));
          this.focus('#forgot-new-password');
        }
      });
  }

  protected startOver(message = ''): void {
    this.resetToken = null;
    this.stopCountdown();
    this.verifyForm.reset();
    this.resetForm.reset();
    this.otpError.set('');
    this.submitted.set(false);
    this.errorMessage.set(message);
    this.goTo('request', '#forgot-username');
  }

  private requestCode(onSent: () => void): void {
    this.isLoading.set(true);
    this.authService
      .requestPasswordReset(this.username())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.infoMessage.set(res.message);
          this.startCountdown(res.resendAfter);
          onSent();
        },
        error: (err: AuthError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.messageFor(err, 'We could not send the verification code. Please try again.'));
        }
      });
  }

  private username(): string {
    return this.requestForm.controls.username.value.trim();
  }

  private goTo(step: Step, focusSelector: string): void {
    this.step.set(step);
    afterNextRender(() => this.focus(focusSelector), { injector: this.injector });
  }

  private focus(selector: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }

  private startCountdown(seconds: number): void {
    this.stopCountdown();
    this.resendCountdown.set(seconds);
    this.countdownSub = timer(1000, 1000)
      .pipe(
        take(seconds),
        map((tick) => seconds - tick - 1)
      )
      .subscribe((remaining) => this.resendCountdown.set(remaining));
  }

  private stopCountdown(): void {
    this.countdownSub?.unsubscribe();
    this.countdownSub = null;
    this.resendCountdown.set(0);
  }

  // The auth-service's OTP-* and VAL-422 messages here are written for end users.
  private messageFor(err: AuthError, fallback: string): string {
    if (this.errorMapping.isNetworkError(err.status)) {
      return this.errorMapping.getNetworkErrorMessage();
    }
    const userFacing = err.errorCode?.startsWith('OTP-') || err.errorCode === 'VAL-422';
    return userFacing && err.message && err.message !== 'Invalid input' ? err.message : fallback;
  }
}
