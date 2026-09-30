import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-container">
      <div class="auth-card card">
        <h1>Sign In</h1>
        <p class="subtitle">Welcome back to the Trading Platform</p>

        <div *ngIf="errorMessage()" class="alert alert-error">
          {{ errorMessage() }}
        </div>

        <form (ngSubmit)="onLogin()" #loginForm="ngForm">
          <div class="form-group">
            <label for="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              [(ngModel)]="username"
              required
              placeholder="Enter your username"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              [(ngModel)]="password"
              required
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" class="btn-primary" [disabled]="isLoading()">
            {{ isLoading() ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <div class="auth-links">
          <p>Don't have an account? <a routerLink="/register">Register here</a></p>
          <p><a routerLink="/admin-login">Admin Login</a></p>
        </div>
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
      font-size: var(--font-size-sm);
    }

    code {
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
      color: var(--rosy-copper);
    }

    .auth-links {
      text-align: center;
      margin-top: var(--spacing-lg);
    }

    .auth-links p {
      margin-bottom: var(--spacing-sm);
    }

    .auth-links a {
      color: var(--primary);
      font-weight: 600;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  
  errorMessage = signal<string>('');
  isLoading = signal<boolean>(false);

  constructor(
    private authService: MockAuthService,
    private kycService: MockKycService,
    private errorMapping: ErrorMappingService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  onLogin(): void {
    if (!this.username || !this.password) {
      this.errorMessage.set('Username and password are required');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const isAdminRoute = this.route.snapshot.data['isAdmin'] === true;

    this.authService.login({
      username: this.username,
      password: this.password
    }, isAdminRoute).subscribe({
      next: (response) => {
        this.isLoading.set(false);
        
        // Check if user is admin by decoding token
        const isAdmin = this.authService.isAdmin();
        
        // If admin, go straight to admin dashboard
        if (isAdmin) {
          this.router.navigate(['/admin/dashboard']);
          return;
        }

        // For customers, check KYC status
        const kycStatus = this.kycService.getKycStatusSignal()();
        
        if (!kycStatus || kycStatus === 'PENDING') {
          // Redirect to KYC if not approved
          this.router.navigate(['/kyc-submission']);
        } else if (kycStatus === 'APPROVED') {
          // Redirect to dashboard if approved
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
          this.router.navigateByUrl(returnUrl);
        } else if (kycStatus === 'REJECTED') {
          // Show message if rejected
          this.errorMessage.set('Your KYC submission was rejected. Please contact support.');
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
      }
    });
  }
}
