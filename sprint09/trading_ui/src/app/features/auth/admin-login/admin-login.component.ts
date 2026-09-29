import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { SessionService } from '../../../core/services/session.service';
import { readableAuthErrorMessage } from '../../../core/services/error-message.util';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
})
export class AdminLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    // Hits /auth/admin/login, which additionally checks the ADMIN role
    // server-side and rejects a non-admin credential with the same
    // AUTH-401 body as any other failed login — this screen never decides
    // who is an admin, it just calls the endpoint that does.
    this.authApi.adminLogin(this.form.getRawValue()).subscribe({
      next: (tokens) => {
        this.submitting.set(false);
        this.session.setTokens(tokens);
        this.router.navigateByUrl('/kyc');
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(readableAuthErrorMessage(error));
      },
    });
  }
}
