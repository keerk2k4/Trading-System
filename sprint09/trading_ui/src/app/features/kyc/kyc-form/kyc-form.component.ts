import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { KycApiService } from '../../../core/services/kyc-api.service';
import { SessionService } from '../../../core/services/session.service';
import { readableAuthErrorMessage } from '../../../core/services/error-message.util';

/**
 * Submits the KYC data the contract actually asks for — date of birth,
 * document type, document number. There is no file/document upload in
 * contracts/auth-api.yaml's KYC operation; if a document image upload is
 * wanted later, it needs its own endpoint and contract entry before this
 * screen can grow a file input — inventing one client-side would call an
 * endpoint that does not exist.
 */
@Component({
  selector: 'app-kyc-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './kyc-form.component.html',
  styleUrl: './kyc-form.component.css',
})
export class KycFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly kycApi = inject(KycApiService);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    dateOfBirth: ['', [Validators.required]],
    documentType: ['PASSPORT', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    documentNumber: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
  });

  submit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.session.isSignedIn()) {
      this.errorMessage.set('Sign in first — KYC submission requires an authenticated session.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.kycApi.submit(this.form.getRawValue()).subscribe({
      next: (kyc) => {
        this.submitting.set(false);
        this.successMessage.set(`KYC submitted — status: ${kyc.status}.`);
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(readableAuthErrorMessage(error));
      },
    });
  }
}
