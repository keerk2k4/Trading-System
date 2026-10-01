import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';

const DOCUMENT_TYPES = [
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'AADHAR', label: 'Aadhar' },
  { value: 'DRIVER_LICENSE', label: 'Driver licence' },
  { value: 'PAN', label: 'PAN card' }
];

@Component({
  selector: 'app-kyc-form',
  imports: [ReactiveFormsModule, StatusBadgeComponent],
  template: `
    <div class="tp-page">
      <header class="tp-page-header">
        <div>
          <h1>Identity verification</h1>
          <p>Verify your identity once to unlock trading on your account.</p>
        </div>
      </header>

      <div class="tp-grid tp-grid-main-side">
        <section class="tp-panel" aria-labelledby="kyc-heading">
          <div class="tp-panel-header">
            <h2 id="kyc-heading">{{ isPending() ? 'Application under review' : 'Your details' }}</h2>
            @if (kycStatus()) {
              <app-status-badge [status]="kycStatus()" />
            }
          </div>

          <div class="tp-panel-body">
            @if (isPending()) {
              <div class="tp-form">
                <div class="tp-alert tp-alert-info" [attr.role]="justSubmitted() ? 'status' : null">
                  <span>
                    @if (justSubmitted()) {
                      <strong>Thanks, your details were submitted.</strong>
                    }
                    An administrator will review your application. Trading unlocks as soon as it is approved.
                  </span>
                </div>
                <div class="tp-actions">
                  <button class="tp-btn tp-btn-secondary" type="button" (click)="goToDashboard()">Go to dashboard</button>
                </div>
              </div>
            } @else {
              <form class="tp-form" [formGroup]="form" (ngSubmit)="onSubmit()">
                @if (kycStatus() === 'REJECTED') {
                  <div class="tp-alert tp-alert-error">
                    <span>
                      <strong>Your previous application was rejected.</strong>
                      {{ rejectionReason || 'Check your details and submit again, or contact support.' }}
                    </span>
                  </div>
                }
                @if (errorMessage(); as message) {
                  <div class="tp-alert tp-alert-error" role="alert"><span>{{ message }}</span></div>
                }

                <div>
                  <label class="tp-label" for="dob">Date of birth</label>
                  <input
                    class="tp-input"
                    id="dob"
                    type="date"
                    formControlName="dateOfBirth"
                    autocomplete="bday"
                    aria-required="true"
                    [attr.aria-invalid]="showError('dateOfBirth') ? 'true' : null"
                    [attr.aria-describedby]="showError('dateOfBirth') ? 'dob-error' : null"
                  />
                  @if (showError('dateOfBirth')) {
                    <p class="tp-field-error" id="dob-error">Enter your date of birth.</p>
                  }
                </div>

                <div class="tp-form-row">
                  <div>
                    <label class="tp-label" for="docType">Document type</label>
                    <select
                      class="tp-input"
                      id="docType"
                      formControlName="documentType"
                      aria-required="true"
                      [attr.aria-invalid]="showError('documentType') ? 'true' : null"
                      [attr.aria-describedby]="showError('documentType') ? 'docType-error' : null"
                    >
                      <option value="" disabled>Select a document</option>
                      @for (type of documentTypes; track type.value) {
                        <option [value]="type.value">{{ type.label }}</option>
                      }
                    </select>
                    @if (showError('documentType')) {
                      <p class="tp-field-error" id="docType-error">Choose a document type.</p>
                    }
                  </div>

                  <div>
                    <label class="tp-label" for="docNum">Document number</label>
                    <input
                      class="tp-input"
                      id="docNum"
                      type="text"
                      formControlName="documentNumber"
                      autocomplete="off"
                      spellcheck="false"
                      aria-required="true"
                      [attr.aria-invalid]="showError('documentNumber') ? 'true' : null"
                      [attr.aria-describedby]="showError('documentNumber') ? 'docNum-error' : null"
                    />
                    @if (showError('documentNumber')) {
                      <p class="tp-field-error" id="docNum-error">Enter the document number.</p>
                    }
                  </div>
                </div>

                <div>
                  <button class="tp-btn tp-btn-primary" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
                    @if (isLoading()) {
                      <span class="tp-spinner" aria-hidden="true"></span>
                      Submitting…
                    } @else {
                      Submit for review
                    }
                  </button>
                  <span class="sr-only" role="status">{{ isLoading() ? 'Submitting your details, please wait.' : '' }}</span>
                </div>
              </form>
            }
          </div>
        </section>

        <section class="tp-panel" aria-labelledby="steps-heading">
          <div class="tp-panel-header">
            <h2 id="steps-heading">How it works</h2>
          </div>
          <ol class="steps tp-panel-body">
            <li
              [class.is-done]="isPending()"
              [class.is-current]="!isPending()"
              [attr.aria-current]="isPending() ? null : 'step'"
            >
              <strong>Submit your details @if (isPending()) {<span class="sr-only">(completed)</span>}</strong>
              <span>Date of birth and one identity document.</span>
            </li>
            <li [class.is-current]="isPending()" [attr.aria-current]="isPending() ? 'step' : null">
              <strong>Administrator review</strong>
              <span>An administrator checks your document.</span>
            </li>
            <li>
              <strong>Start trading</strong>
              <span>Your dashboard and order ticket unlock.</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .steps { display: grid; gap: 1rem; list-style: none; counter-reset: step; }
    .steps li { position: relative; display: grid; gap: 0.125rem; padding-left: 2.5rem; font-size: 0.875rem; counter-increment: step; }
    .steps li::before {
      content: counter(step); position: absolute; left: 0; top: 0; display: grid; place-items: center;
      width: 1.75rem; height: 1.75rem; font-size: 0.8125rem; font-weight: 600; color: var(--tp-text-muted);
      border: 1px solid var(--tp-border-strong); border-radius: 50%;
    }
    .steps li.is-current::before { color: var(--tp-on-accent); background: var(--tp-accent); border-color: var(--tp-accent); }
    .steps li.is-done::before { content: '✓'; color: var(--tp-positive); border-color: currentColor; }
    .steps span { color: var(--tp-text-muted); }
  `]
})
export class KycFormComponent implements OnInit {
  private readonly kycService = inject(MockKycService);
  private readonly authService = inject(MockAuthService);
  private readonly errorMapping = inject(ErrorMappingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly form = inject(NonNullableFormBuilder).group({
    dateOfBirth: ['', Validators.required],
    documentType: ['', Validators.required],
    documentNumber: ['', Validators.required]
  });

  protected readonly kycStatus = signal('');
  protected readonly isPending = computed(() => this.kycStatus() === 'PENDING');
  protected readonly justSubmitted = signal(false);
  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected rejectionReason = '';

  ngOnInit(): void {
    // Check current KYC status
    this.kycStatus.set(this.kycService.getCurrentUserKycStatus() ?? '');
  }

  protected showError(name: 'dateOfBirth' | 'documentType' | 'documentNumber'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    if (this.isLoading()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.host.nativeElement.querySelector<HTMLElement>('.ng-invalid:not(form)')?.focus();
      return;
    }

    const user = this.authService.getCurrentUser();
    if (!user) {
      this.errorMessage.set('No authenticated user found');
      return;
    }

    this.isLoading.set(true);

    this.kycService
      .submitKyc(user.id, this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.justSubmitted.set(true);
          this.kycStatus.set('PENDING');
        },
        error: (err: { errorCode?: string }) => {
          this.isLoading.set(false);
          this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode ?? ''));
        }
      });
  }

  protected goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
