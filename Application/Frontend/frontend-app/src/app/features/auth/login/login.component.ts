import { Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { KycSubmission } from '../../../shared/models/kyc.models';
import { AuthError } from '../../../shared/models/auth.models';
import { MockAuthService } from '../../../shared/services/auth.service';
import { MockKycService } from '../../../shared/services/kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { AuthShellComponent } from '../auth-shell/auth-shell.component';
import { safeReturnUrl } from '../../../shared/guards/safe-return-url';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  template: `
    <app-auth-shell
      [heading]="isAdminLogin ? 'Admin sign in' : 'Welcome back'"
      [subtitle]="isAdminLogin ? 'Sign in with your administrator account.' : 'Sign in to your trading account.'"
    >
      <form class="tp-form" [formGroup]="form" (ngSubmit)="onSubmit()">
        @if (errorMessage(); as message) {
          <div class="tp-alert tp-alert-error" role="alert" data-testid="login-error">
            <span>{{ message }}</span>
          </div>
        }

        <div>
          <label class="tp-label" for="login-username">Username</label>
          <input
            class="tp-input"
            id="login-username"
            data-testid="login-username"
            type="text"
            formControlName="username"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            aria-required="true"
            [attr.aria-invalid]="usernameError() ? 'true' : null"
            [attr.aria-describedby]="usernameError() ? 'login-username-error' : null"
          />
          @if (usernameError(); as message) {
            <p class="tp-field-error" id="login-username-error" data-testid="login-username-error">{{ message }}</p>
          }
        </div>

        <div>
          <label class="tp-label" for="login-password">Password</label>
          <div class="tp-input-wrap">
            <input
              class="tp-input"
              id="login-password"
              data-testid="login-password"
              [type]="passwordVisible() ? 'text' : 'password'"
              formControlName="password"
              autocomplete="current-password"
              aria-required="true"
              [attr.aria-invalid]="passwordError() ? 'true' : null"
              [attr.aria-describedby]="passwordError() ? 'login-password-error' : null"
            />
            <button
              class="tp-input-action"
              type="button"
              [class.is-active]="passwordVisible()"
              data-testid="login-toggle-password"
              [attr.aria-label]="passwordVisible() ? 'Hide password' : 'Show password'"
              (click)="togglePasswordVisibility()"
            ></button>
          </div>
          @if (passwordError(); as message) {
            <p class="tp-field-error" id="login-password-error" data-testid="login-password-error">{{ message }}</p>
          }
          @if (!isAdminLogin) {
            <p class="tp-hint">
              <a class="tp-link" routerLink="/forgot-password" data-testid="login-forgot-password-link">Forgot password?</a>
            </p>
          }
        </div>

        <button
          class="tp-btn tp-btn-primary tp-btn-block"
          data-testid="login-submit"
          type="submit"
          [attr.aria-disabled]="isLoading() ? 'true' : null">
          @if (isLoading()) {
            <span class="tp-spinner" aria-hidden="true"></span>
            Signing in…
          } @else {
            Sign in
          }
        </button>
        <span class="sr-only" role="status">{{ isLoading() ? 'Signing in, please wait.' : '' }}</span>
      </form>

      @if (isAdminLogin) {
        <p class="tp-form-footer">
          Not an administrator? <a class="tp-link" routerLink="/login">Customer sign in</a>
        </p>
      } @else {
        <p class="tp-form-footer">
          Don't have an account? <a class="tp-link" routerLink="/register" data-testid="login-register-link">Create one</a>
        </p>
      }
    </app-auth-shell>
  `
})
export class LoginComponent {
  private readonly authService = inject(MockAuthService);
  private readonly kycService = inject(MockKycService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // The /admin-login route reuses this screen but signs in through
  // POST /auth/admin/login instead of POST /auth/login.
  protected readonly isAdminLogin = this.route.snapshot.data['isAdmin'] === true;

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]]
  });

  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly passwordVisible = signal(false);

  protected usernameError(): string | null {
    const control = this.form.controls.username;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return control.hasError('required')
      ? 'Enter your username.'
      : 'Username must be 64 characters or fewer.';
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    if (control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return control.hasError('required')
      ? 'Enter your password.'
      : 'Password must be 128 characters or fewer.';
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
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

    this.isLoading.set(true);
    this.authService
      .login(this.form.getRawValue(), this.isAdminLogin)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.enterApplication();
        },
        error: (err: AuthError) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.messageFor(err));
          this.host.nativeElement.querySelector<HTMLElement>('#login-password')?.focus();
        }
      });
  }

  private enterApplication(): void {
    // Admins go straight to the admin dashboard.
    if (this.authService.isAdmin()) {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    const user = this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/kyc-submission']);
      return;
    }

    // Always read KYC from backend after login so one user's cached status
    // never leaks into another user's session.
    this.kycService
      .getKycStatus(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (kyc: KycSubmission | null) => {
          if (kyc?.status === 'APPROVED') {
            this.router.navigateByUrl(this.returnUrl('/dashboard'));
            return;
          }
          this.router.navigate(['/kyc-submission']);
        },
        error: () => {
          this.router.navigate(['/kyc-submission']);
        }
      });
  }

  // Only in-app paths are honoured, so a crafted link cannot send a freshly
  // signed-in user to another site.
  // The backend answers every failed sign-in with the same AUTH-401, and the
  // message here is equally silent about which half of the pair was wrong.
  private messageFor(err: AuthError): string {
    if (this.errorMapping.isNetworkError(err.status)) {
      return this.errorMapping.getNetworkErrorMessage();
    }
    switch (err.errorCode) {
      case 'AUTH-401':
        return 'Incorrect username or password. Check your details and try again.';
      case 'VAL-422':
        return 'Those details were not accepted. Check your username and password and try again.';
      // Correct credentials for a BLOCKED or CLOSED account.
      case 'ACC-403':
        return "This account can't be used to sign in. Please contact support.";
      default:
        return this.errorMapping.getErrorMessage(err.errorCode);
    }
  }

  // The returnUrl query param is attacker-controllable (anyone can share a
  // sign-in link), so only a path on this origin is honoured.
  private returnUrl(fallback: string): string {
    return safeReturnUrl(this.route.snapshot.queryParams['returnUrl'], fallback);
  }
}
