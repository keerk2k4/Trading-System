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

// Validates the confirm-password control against its sibling password control.
function matchesPassword(control: AbstractControl): ValidationErrors | null {
  const password: unknown = control.parent?.get('password')?.value;
  return control.value === password ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  styles: `
    .tp-otp-row {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }
    .tp-otp-row .tp-input {
      flex: 1;
      min-width: 0;
    }
    .tp-otp-row .tp-btn {
      flex: none;
      min-height: 2.75rem;
    }
  `,
  template: `
    <app-auth-shell [heading]="heading()" [subtitle]="subtitle()">
      @if (registeredUsername(); as username) {
        <div class="tp-form">
          <div class="tp-alert tp-alert-success" role="status" data-testid="register-success">
            <span>
              The account <strong>{{ username }}</strong> is ready. Sign in with your new username and
              password to continue.
            </span>
          </div>
          <a class="tp-btn tp-btn-primary tp-btn-block" routerLink="/login" data-testid="register-continue">Continue to sign in</a>
        </div>
      } @else {
        <form class="tp-form" [formGroup]="form" (ngSubmit)="onSubmit()">
          @if (errorMessage(); as message) {
            <div class="tp-alert tp-alert-error" role="alert" data-testid="register-error">
              <span>{{ message }}</span>
            </div>
          }

          <div>
            <label class="tp-label" for="register-username">Username</label>
            <input
              class="tp-input"
              id="register-username"
              data-testid="register-username"
              type="text"
              formControlName="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              aria-required="true"
              [attr.aria-invalid]="usernameError() ? 'true' : null"
              [attr.aria-describedby]="usernameError() ? 'register-username-error' : 'register-username-hint'"
            />
            @if (usernameError(); as message) {
              <p class="tp-field-error" id="register-username-error" data-testid="register-username-error">{{ message }}</p>
            } @else {
              <p class="tp-hint" id="register-username-hint">
                3–64 characters: letters, numbers, dots, dashes and underscores.
              </p>
            }
          </div>

          <div>
            <label class="tp-label" for="register-email">Email</label>
            <div class="tp-otp-row">
              <input
                class="tp-input"
                id="register-email"
                data-testid="register-email"
                type="email"
                formControlName="email"
                autocomplete="email"
                autocapitalize="none"
                spellcheck="false"
                aria-required="true"
                [readOnly]="emailVerified()"
                [attr.aria-invalid]="emailError() ? 'true' : null"
                [attr.aria-describedby]="emailError() ? 'register-email-error' : 'register-email-hint'"
              />
              @if (emailVerified()) {
                <button class="tp-btn tp-btn-secondary" type="button" data-testid="register-change-email" (click)="changeEmail()">
                  Change
                </button>
              } @else {
                <button
                  class="tp-btn tp-btn-secondary"
                  id="register-send-otp"
                  type="button"
                  data-testid="register-send-otp"
                  [attr.aria-disabled]="otpSending() || resendCountdown() > 0 ? 'true' : null"
                  (click)="sendOtp()"
                >
                  @if (otpSending()) {
                    <span class="tp-spinner" aria-hidden="true"></span>
                    Sending…
                  } @else if (resendCountdown() > 0) {
                    Resend in {{ resendCountdown() }}s
                  } @else if (otpSent()) {
                    Resend OTP
                  } @else {
                    Send OTP
                  }
                </button>
              }
            </div>
            @if (emailError(); as message) {
              <p class="tp-field-error" id="register-email-error" data-testid="register-email-error">{{ message }}</p>
            } @else if (emailVerified()) {
              <p class="tp-hint is-met" id="register-email-hint" data-testid="register-email-verified">Email verified.</p>
            } @else if (otpSent()) {
              <p class="tp-hint" id="register-email-hint" data-testid="register-otp-sent">
                We sent a 6-digit code to this address. It expires in 10 minutes.
              </p>
            } @else {
              <p class="tp-hint" id="register-email-hint">You must verify your email with a one-time code before registering.</p>
            }
          </div>

          @if (otpSent() && !emailVerified()) {
            <div>
              <label class="tp-label" for="register-otp">Verification code</label>
              <div class="tp-otp-row">
                <input
                  class="tp-input"
                  id="register-otp"
                  data-testid="register-otp"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  [formControl]="otpControl"
                  autocomplete="one-time-code"
                  aria-required="true"
                  [attr.aria-invalid]="otpError() ? 'true' : null"
                  [attr.aria-describedby]="otpError() ? 'register-otp-error' : null"
                  (keydown.enter)="$event.preventDefault(); verifyOtp()"
                />
                <button
                  class="tp-btn tp-btn-primary"
                  type="button"
                  data-testid="register-verify-otp"
                  [attr.aria-disabled]="otpVerifying() ? 'true' : null"
                  (click)="verifyOtp()"
                >
                  @if (otpVerifying()) {
                    <span class="tp-spinner" aria-hidden="true"></span>
                    Verifying…
                  } @else {
                    Verify
                  }
                </button>
              </div>
              @if (otpError(); as message) {
                <p class="tp-field-error" id="register-otp-error" role="alert" data-testid="register-otp-error">{{ message }}</p>
              }
            </div>
          }

          <div>
            <label class="tp-label" for="register-first-name">First name</label>
            <input
              class="tp-input"
              id="register-first-name"
              data-testid="register-first-name"
              type="text"
              formControlName="firstName"
              autocomplete="given-name"
              aria-required="true"
              [attr.aria-invalid]="firstNameError() ? 'true' : null"
              [attr.aria-describedby]="firstNameError() ? 'register-first-name-error' : null"
            />
            @if (firstNameError(); as message) {
              <p class="tp-field-error" id="register-first-name-error" data-testid="register-first-name-error">{{ message }}</p>
            }
          </div>

          <div>
            <label class="tp-label" for="register-last-name">Last name</label>
            <input
              class="tp-input"
              id="register-last-name"
              data-testid="register-last-name"
              type="text"
              formControlName="lastName"
              autocomplete="family-name"
              aria-required="true"
              [attr.aria-invalid]="lastNameError() ? 'true' : null"
              [attr.aria-describedby]="lastNameError() ? 'register-last-name-error' : null"
            />
            @if (lastNameError(); as message) {
              <p class="tp-field-error" id="register-last-name-error" data-testid="register-last-name-error">{{ message }}</p>
            }
          </div>

          <div>
            <label class="tp-label" for="register-phone">Phone</label>
            <input
              class="tp-input"
              id="register-phone"
              data-testid="register-phone"
              type="tel"
              formControlName="phone"
              autocomplete="tel"
              aria-required="true"
              [attr.aria-invalid]="phoneError() ? 'true' : null"
              [attr.aria-describedby]="phoneError() ? 'register-phone-error' : null"
            />
            @if (phoneError(); as message) {
              <p class="tp-field-error" id="register-phone-error" data-testid="register-phone-error">{{ message }}</p>
            }
          </div>

          <div>
            <label class="tp-label" for="register-password">Password</label>
            <div class="tp-input-wrap">
              <input
                class="tp-input"
                id="register-password"
                data-testid="register-password"
                [type]="passwordsVisible() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="new-password"
                aria-required="true"
                [attr.aria-invalid]="passwordError() ? 'true' : null"
                [attr.aria-describedby]="passwordError() ? 'register-password-error' : 'register-password-hint'"
              />
              <button
                class="tp-input-action"
                type="button"
                [class.is-active]="passwordsVisible()"
                data-testid="register-toggle-password"
                [attr.aria-label]="passwordsVisible() ? 'Hide passwords' : 'Show passwords'"
                (click)="togglePasswordVisibility()"
              ></button>
            </div>
            @if (passwordError(); as message) {
              <p class="tp-field-error" id="register-password-error" data-testid="register-password-error">{{ message }}</p>
            } @else {
              <p class="tp-hint" [class.is-met]="passwordLongEnough()" id="register-password-hint">
                At least 12 characters.
              </p>
            }
          </div>

          <div>
            <label class="tp-label" for="register-confirm-password">Confirm password</label>
            <input
              class="tp-input"
              id="register-confirm-password"
              data-testid="register-confirm-password"
              [type]="passwordsVisible() ? 'text' : 'password'"
              formControlName="confirmPassword"
              autocomplete="new-password"
              aria-required="true"
              [attr.aria-invalid]="confirmPasswordError() ? 'true' : null"
              [attr.aria-describedby]="confirmPasswordError() ? 'register-confirm-password-error' : null"
            />
            @if (confirmPasswordError(); as message) {
              <p class="tp-field-error" id="register-confirm-password-error" data-testid="register-confirm-password-error">{{ message }}</p>
            }
          </div>

          <button class="tp-btn tp-btn-primary tp-btn-block" data-testid="register-submit" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
            @if (isLoading()) {
              <span class="tp-spinner" aria-hidden="true"></span>
              Creating account…
            } @else {
              Create account
            }
          </button>
          <span class="sr-only" role="status">{{ isLoading() ? 'Creating your account, please wait.' : '' }}</span>
        </form>

        <p class="tp-form-footer">
          Already have an account? <a class="tp-link" routerLink="/login">Sign in</a>
        </p>
      }
    </app-auth-shell>
  `
})
export class RegisterComponent {
  private readonly authService = inject(MockAuthService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly shell = viewChild.required(AuthShellComponent);

  // Mirrors the backend's RegisterRequest rules. confirmPassword exists only
  // in this form and is never sent.
  protected readonly form = inject(NonNullableFormBuilder).group({
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(64),
        Validators.pattern(/^[a-zA-Z0-9._-]+$/)
      ]
    ],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[1-9]\d{7,14}$/)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    confirmPassword: ['', [Validators.required, matchesPassword]]
  });

  // Kept outside the main form: it only matters until the email is verified,
  // and it is never part of the registration request.
  protected readonly otpControl = inject(NonNullableFormBuilder).control('', [
    Validators.required,
    Validators.pattern(/^\d{6}$/)
  ]);

  protected readonly otpSent = signal(false);
  protected readonly otpSending = signal(false);
  protected readonly otpVerifying = signal(false);
  protected readonly otpError = signal('');
  protected readonly resendCountdown = signal(0);
  // The token proves to the backend that this exact email was verified.
  private readonly verificationToken = signal<string | null>(null);
  protected readonly emailVerified = computed(() => this.verificationToken() !== null);
  private countdownSub: Subscription | null = null;

  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly passwordsVisible = signal(false);
  protected readonly registeredUsername = signal<string | null>(null);

  protected readonly heading = computed(() =>
    this.registeredUsername() ? 'Account created' : 'Create your account'
  );
  protected readonly subtitle = computed(() =>
    this.registeredUsername() ? '' : 'Register to start trading.'
  );

  constructor() {
    // Editing the password can make an untouched confirmation stale.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());

    // A code or verification belongs to one address; editing it starts over.
    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.otpSent() || this.emailVerified()) {
          this.resetOtpState();
        }
      });

    this.destroyRef.onDestroy(() => this.countdownSub?.unsubscribe());
  }

  protected usernameError(): string | null {
    const control = this.form.controls.username;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a username.';
    }
    if (control.hasError('taken')) {
      return this.errorMapping.getErrorMessage('AUTH-409');
    }
    if (control.hasError('minlength')) {
      return 'Username must be at least 3 characters.';
    }
    if (control.hasError('maxlength')) {
      return 'Username must be 64 characters or fewer.';
    }
    return 'Use only letters, numbers, dots, dashes and underscores.';
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a password.';
    }
    return control.hasError('minlength')
      ? 'Password must be at least 12 characters.'
      : 'Password must be 128 characters or fewer.';
  }

  protected emailError(): string | null {
    const control = this.form.controls.email;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter an email address.';
    }
    if (control.hasError('maxlength')) {
      return 'Email must be 254 characters or fewer.';
    }
    return 'Enter a valid email address.';
  }

  protected firstNameError(): string | null {
    const control = this.form.controls.firstName;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter your first name.';
    }
    return 'First name must be 80 characters or fewer.';
  }

  protected lastNameError(): string | null {
    const control = this.form.controls.lastName;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter your last name.';
    }
    return 'Last name must be 80 characters or fewer.';
  }

  protected phoneError(): string | null {
    const control = this.form.controls.phone;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    if (control.hasError('required')) {
      return 'Enter a phone number.';
    }
    return 'Enter a valid phone number in international format.';
  }

  protected passwordLongEnough(): boolean {
    return this.form.controls.password.value.length >= 12;
  }

  protected confirmPasswordError(): string | null {
    const control = this.form.controls.confirmPassword;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return control.hasError('required') ? 'Confirm your password.' : 'Passwords do not match.';
  }

  protected sendOtp(): void {
    if (this.otpSending() || this.resendCountdown() > 0) {
      return;
    }

    const emailControl = this.form.controls.email;
    emailControl.markAsTouched();
    if (emailControl.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('#register-email')?.focus();
      return;
    }

    this.otpSending.set(true);
    this.otpError.set('');
    this.errorMessage.set('');

    this.authService
      .sendRegistrationOtp(emailControl.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.otpSending.set(false);
          this.otpSent.set(true);
          this.otpControl.reset();
          this.startResendCountdown(res.resendAfter);
          afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#register-otp')?.focus(), {
            injector: this.injector
          });
        },
        error: (err: AuthError) => {
          this.otpSending.set(false);
          this.errorMessage.set(this.otpErrorMessage(err, 'We could not send the verification code. Please try again.'));
        }
      });
  }

  protected verifyOtp(): void {
    if (this.otpVerifying()) {
      return;
    }

    this.otpError.set('');
    const otp = this.otpControl.value.trim();
    if (!/^\d{6}$/.test(otp)) {
      this.otpError.set('Enter the 6-digit code from the email.');
      this.host.nativeElement.querySelector<HTMLElement>('#register-otp')?.focus();
      return;
    }

    this.otpVerifying.set(true);
    this.authService
      .verifyRegistrationOtp(this.form.controls.email.value, otp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.otpVerifying.set(false);
          this.verificationToken.set(res.verificationToken);
          this.errorMessage.set('');
          this.stopResendCountdown();
        },
        error: (err: AuthError) => {
          this.otpVerifying.set(false);
          // An expired or burned code cannot be retried; the user needs a new one.
          if (err.errorCode === 'OTP-410' || err.errorCode === 'OTP-429' || err.errorCode === 'OTP-404') {
            this.otpControl.reset();
            this.stopResendCountdown();
          }
          this.otpError.set(this.otpErrorMessage(err, 'The code could not be verified. Please try again.'));
          this.host.nativeElement.querySelector<HTMLElement>('#register-otp')?.focus();
        }
      });
  }

  protected changeEmail(): void {
    this.resetOtpState();
    this.host.nativeElement.querySelector<HTMLElement>('#register-email')?.focus();
  }

  private resetOtpState(): void {
    this.verificationToken.set(null);
    this.otpSent.set(false);
    this.otpError.set('');
    this.otpControl.reset();
    this.stopResendCountdown();
  }

  private startResendCountdown(seconds: number): void {
    this.stopResendCountdown();
    this.resendCountdown.set(seconds);
    this.countdownSub = timer(1000, 1000)
      .pipe(
        take(seconds),
        map((tick) => seconds - tick - 1)
      )
      .subscribe((remaining) => this.resendCountdown.set(remaining));
  }

  private stopResendCountdown(): void {
    this.countdownSub?.unsubscribe();
    this.countdownSub = null;
    this.resendCountdown.set(0);
  }

  // The auth-service's OTP-* messages are written for end users, so they are shown as-is.
  private otpErrorMessage(err: AuthError, fallback: string): string {
    if (this.errorMapping.isNetworkError(err.status)) {
      return this.errorMapping.getNetworkErrorMessage();
    }
    if (err.errorCode === 'VAL-422') {
      return 'Enter a valid email address.';
    }
    return err.errorCode?.startsWith('OTP-') && err.message ? err.message : fallback;
  }

  protected togglePasswordVisibility(): void {
    this.passwordsVisible.update((visible) => !visible);
  }

  protected onSubmit(): void {
    if (this.isLoading()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }

    const emailVerificationToken = this.verificationToken();
    if (!emailVerificationToken) {
      this.errorMessage.set(
        this.otpSent()
          ? 'Enter the verification code sent to your email and press Verify before creating your account.'
          : 'Verify your email address before creating your account. Press "Send OTP" to get a code.'
      );
      this.host.nativeElement
        .querySelector<HTMLElement>(this.otpSent() ? '#register-otp' : '#register-send-otp')
        ?.focus();
      return;
    }

    this.isLoading.set(true);
    const { username, email, firstName, lastName, phone, password } = this.form.getRawValue();

    this.authService
      .register({ username, email, firstName, lastName, phone, password, emailVerificationToken })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          // The response is only { id, username, roles } - no tokens - so the
          // user is not signed in yet and has to go through the login screen.
          this.isLoading.set(false);
          this.registeredUsername.set(user.username || username);
          afterNextRender(() => this.shell().focusHeading(), { injector: this.injector });
        },
        error: (err: AuthError) => {
          this.isLoading.set(false);
          this.showError(err);
        }
      });
  }

  private showError(err: AuthError): void {
    if (err.errorCode === 'AUTH-409') {
      // Reported on the field itself; it clears as soon as the username is edited.
      const username = this.form.controls.username;
      username.setErrors({ taken: true });
      this.host.nativeElement.querySelector<HTMLElement>('#register-username')?.focus();
      return;
    }

    if (err.errorCode === 'OTP-403') {
      // The verification expired or was already used: the email must be verified again.
      this.resetOtpState();
      this.errorMessage.set('Your email verification has expired. Press "Send OTP" to verify your email again.');
      this.host.nativeElement.querySelector<HTMLElement>('#register-send-otp')?.focus();
      return;
    }

    if (this.errorMapping.isNetworkError(err.status)) {
      this.errorMessage.set(this.errorMapping.getNetworkErrorMessage());
    } else if (err.errorCode === 'VAL-422') {
      this.errorMessage.set(
        'Those details were not accepted. Check the username and password requirements and try again.'
      );
    } else {
      this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
    }
  }
}
