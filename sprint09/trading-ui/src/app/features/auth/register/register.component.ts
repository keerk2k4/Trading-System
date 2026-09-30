import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';

// Deliberately loose: the auth-service's @IsEmail() is the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-container">
      <div class="auth-card card">
        <h1>Create Account</h1>
        <p class="subtitle">Register to start trading</p>

        <div *ngIf="errorMessage()" class="alert alert-error">
          {{ errorMessage() }}
        </div>

        <div *ngIf="successMessage()" class="alert alert-success">
          {{ successMessage() }}
        </div>

        <form (ngSubmit)="onRegister()" #registerForm="ngForm">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              [(ngModel)]="username"
              required
              minlength="3"
              maxlength="64"
              placeholder="Enter your username"
            />
            <small>3-64 characters (alphanumeric, dots, dashes, underscores)</small>
          </div>

          <div class="validation-summary" *ngIf="getUsernameValidationErrors().length > 0">
            <strong>Username requirements:</strong>
            <ul>
              <li *ngFor="let error of getUsernameValidationErrors()">{{ error }}</li>
            </ul>
          </div>

          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              [(ngModel)]="email"
              required
              maxlength="254"
              placeholder="you@example.com"
            />
            <small>We'll email you about your registration and KYC status</small>
          </div>

          <div class="validation-summary" *ngIf="getEmailValidationErrors().length > 0">
            <strong>Email requirements:</strong>
            <ul>
              <li *ngFor="let error of getEmailValidationErrors()">{{ error }}</li>
            </ul>
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              [(ngModel)]="password"
              required
              minlength="12"
              maxlength="128"
              placeholder="Minimum 12 characters"
            />
            <small>12-128 characters required</small>
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              [(ngModel)]="confirmPassword"
              required
              minlength="12"
              maxlength="128"
              placeholder="Re-enter your password"
            />
          </div>

          <div class="validation-summary" *ngIf="getPasswordValidationErrors().length > 0">
            <strong>Password requirements:</strong>
            <ul>
              <li *ngFor="let error of getPasswordValidationErrors()">{{ error }}</li>
            </ul>
          </div>

          <button type="submit" class="btn-primary" [disabled]="isLoading() || !isFormValid()">
            {{ isLoading() ? 'Creating Account...' : 'Register' }}
          </button>
        </form>

        <p class="auth-link">
          Already have an account? <a routerLink="/login">Sign in here</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(135deg, var(--azure-mist), var(--light));
      padding: var(--spacing-lg);
    }

    .auth-card {
      max-width: 400px;
      width: 100%;
    }

    h1 {
      color: var(--prussian-blue);
      margin-bottom: var(--spacing-sm);
      text-align: center;
    }

    .subtitle {
      text-align: center;
      color: var(--steel-blue);
      margin-bottom: var(--spacing-lg);
    }

    .alert {
      margin-bottom: var(--spacing-md);
    }

    .auth-link {
      text-align: center;
      margin-top: var(--spacing-lg);
    }

    .auth-link a {
      color: var(--primary);
      font-weight: 600;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .validation-summary {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      margin-bottom: var(--spacing-md);
      color: #856404;
    }

    .validation-summary strong {
      display: block;
      margin-bottom: var(--spacing-sm);
      font-weight: 600;
    }

    .validation-summary ul {
      margin: 0;
      padding-left: var(--spacing-lg);
    }

    .validation-summary li {
      margin-bottom: var(--spacing-xs);
      font-size: var(--font-size-sm);
    }

    small {
      display: block;
      font-size: var(--font-size-sm);
      color: var(--steel-blue);
      margin-top: var(--spacing-xs);
    }
  `]
})
export class RegisterComponent {
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  
  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  constructor(
    private authService: MockAuthService,
    private errorMapping: ErrorMappingService,
    private router: Router
  ) {}

  getPasswordValidationErrors(): string[] {
    const errors: string[] = [];

    if (this.password.length > 0) {
      if (this.password.length < 12) {
        errors.push('Password must be at least 12 characters');
      }
      if (this.password.length > 128) {
        errors.push('Password cannot exceed 128 characters');
      }
    }

    if (this.password && this.confirmPassword && this.password !== this.confirmPassword) {
      errors.push('Passwords do not match');
    }

    return errors;
  }

  getUsernameValidationErrors(): string[] {
    const errors: string[] = [];

    if (this.username.length > 0) {
      if (this.username.length < 3) {
        errors.push('Username must be at least 3 characters');
      }
      if (this.username.length > 64) {
        errors.push('Username cannot exceed 64 characters');
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(this.username)) {
        errors.push('Username can only contain letters, numbers, dots, dashes, and underscores');
      }
    }

    return errors;
  }

  getEmailValidationErrors(): string[] {
    const errors: string[] = [];

    if (this.email.length > 0) {
      if (!EMAIL_PATTERN.test(this.email.trim())) {
        errors.push('Enter a valid email address, e.g. you@example.com');
      }
      if (this.email.trim().length > 254) {
        errors.push('Email cannot exceed 254 characters');
      }
    }

    return errors;
  }

  isFormValid(): boolean {
    return (
      this.username.length >= 3 &&
      this.username.length <= 64 &&
      /^[a-zA-Z0-9._-]+$/.test(this.username) &&
      this.email.trim().length > 0 &&
      this.getEmailValidationErrors().length === 0 &&
      this.password.length >= 12 &&
      this.password.length <= 128 &&
      this.confirmPassword.length >= 12 &&
      this.password === this.confirmPassword
    );
  }

  onRegister(): void {
    if (!this.username || !this.email || !this.password || !this.confirmPassword) {
      this.errorMessage.set('All fields are required');
      return;
    }

    const usernameErrors = this.getUsernameValidationErrors();
    if (usernameErrors.length > 0) {
      this.errorMessage.set('Please fix username requirements before submitting');
      return;
    }

    if (this.getEmailValidationErrors().length > 0) {
      this.errorMessage.set('Please enter a valid email address before submitting');
      return;
    }

    const validationErrors = this.getPasswordValidationErrors();
    if (validationErrors.length > 0) {
      this.errorMessage.set('Please fix password requirements before submitting');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.register({
      username: this.username,
      email: this.email.trim(),
      password: this.password,
      confirmPassword: this.confirmPassword
    }).subscribe({
      next: (response) => {
        // The real endpoint only returns { id, username, roles } - the
        // trading account itself is provisioned asynchronously afterwards,
        // so there's no accountId to show yet at this point.
        this.successMessage.set(
          `Account created for ${response.username}. A confirmation email is on its way. Redirecting to login...`
        );
        this.isLoading.set(false);
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
      }
    });
  }
}
