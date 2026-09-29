import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../../../core/services/auth-api.service';
import { SessionService } from '../../../core/services/session.service';
import { readableAuthErrorMessage } from '../../../core/services/error-message.util';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
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
    this.authApi.login(this.form.getRawValue()).subscribe({
      next: (tokens) => {
        this.submitting.set(false);
        this.session.setTokens(tokens);
        // NOTE: a real route guard would carry a `returnUrl` query param here
        // and redirect back to it (validated as a same-origin path). That is
        // the "Route Guards and the Return Address" story — this screen just
        // sends a signed-in user to a fixed landing route for now.
        this.router.navigateByUrl('/kyc');
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(readableAuthErrorMessage(error));
      },
    });
  }
}
