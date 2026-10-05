import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MockAuthService } from '../../../shared/services/auth.service';
import { MockKycService } from '../../../shared/services/kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { KycStatus, KycSubmission } from '../../../shared/models/kyc.models';

const DOCUMENT_TYPES = [
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'AADHAR', label: 'Aadhar' },
  { value: 'DRIVER_LICENSE', label: 'Driver licence' },
  { value: 'PAN', label: 'PAN card' }
];

function minimumAgeValidator(minimumAge: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (!value) {
      return null;
    }

    const dob = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dob.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDelta = today.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }

    return age >= minimumAge ? null : { minimumAge: true };
  };
}

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
            <h2 id="kyc-heading">Your details</h2>
            @if (kycStatus()) {
              <app-status-badge data-testid="kyc-status" [status]="kycStatus()" />
            }
          </div>

          <div class="tp-panel-body">
            @if (isLoadingExistingKyc()) {
              <div class="tp-empty">Loading your KYC details…</div>
            } @else {
              <div class="tp-form">
                @if (isUpdateMode()) {
                  <div class="tp-alert tp-alert-info" data-testid="kyc-info" [attr.role]="justSubmitted() ? 'status' : null">
                    <span>
                      @if (justSubmitted()) {
                        <strong>Your KYC details were updated.</strong>
                      } @else {
                        <strong>You already have a submitted KYC.</strong>
                      }
                      You can update these details and resubmit for review.
                    </span>
                  </div>
                }

                <form class="tp-form" [formGroup]="form" (ngSubmit)="onSubmit()">
                @if (kycStatus() === 'REJECTED') {
                  <div class="tp-alert tp-alert-error" data-testid="kyc-rejected">
                    <span>
                      <strong>Your previous application was rejected.</strong>
                      {{ rejectionReason || 'Check your details and submit again, or contact support.' }}
                    </span>
                  </div>
                }
                @if (errorMessage(); as message) {
                  <div class="tp-alert tp-alert-error" role="alert" data-testid="kyc-error"><span>{{ message }}</span></div>
                }

                <div>
                  <label class="tp-label" for="dob">Date of birth</label>
                  <input
                    class="tp-input"
                    id="dob"
                    data-testid="kyc-dob"
                    type="date"
                    formControlName="dateOfBirth"
                    autocomplete="bday"
                    aria-required="true"
                    [attr.aria-invalid]="showError('dateOfBirth') ? 'true' : null"
                    [attr.aria-describedby]="showError('dateOfBirth') ? 'dob-error' : null"
                  />
                  @if (showError('dateOfBirth')) {
                    <p class="tp-field-error" id="dob-error" data-testid="dob-error">{{ dobErrorMessage() }}</p>
                  }
                </div>

                <div class="tp-form-row">
                  <div>
                    <label class="tp-label" for="docType">Document type</label>
                    <select
                      class="tp-input"
                      id="docType"
                      data-testid="kyc-doc-type"
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
                      <p class="tp-field-error" id="docType-error" data-testid="docType-error">Choose a document type.</p>
                    }
                  </div>

                  <div>
                    <label class="tp-label" for="docNum">Document number</label>
                    <input
                      class="tp-input"
                      id="docNum"
                      data-testid="kyc-doc-number"
                      type="text"
                      formControlName="documentNumber"
                      autocomplete="off"
                      spellcheck="false"
                      aria-required="true"
                      [attr.aria-invalid]="showError('documentNumber') ? 'true' : null"
                      [attr.aria-describedby]="showError('documentNumber') ? 'docNum-error' : null"
                    />
                    @if (showError('documentNumber')) {
                      <p class="tp-field-error" id="docNum-error" data-testid="docNum-error">Enter the document number.</p>
                    }
                  </div>
                </div>

                <div>
                  <button class="tp-btn tp-btn-primary" data-testid="kyc-submit" type="submit" [attr.aria-disabled]="isLoading() ? 'true' : null">
                    @if (isLoading()) {
                      <span class="tp-spinner" aria-hidden="true"></span>
                      {{ isUpdateMode() ? 'Updating…' : 'Submitting…' }}
                    } @else {
                      {{ isUpdateMode() ? 'Update submission' : 'Submit for review' }}
                    }
                  </button>
                  <span class="sr-only" role="status">{{ isLoading() ? 'Submitting your details, please wait.' : '' }}</span>
                </div>
              </form>

              <div class="tp-actions">
                <button class="tp-btn tp-btn-secondary" type="button" data-testid="kyc-go-dashboard" (click)="goToDashboard()">Go to dashboard</button>
              </div>
            </div>
            }
          </div>
        </section>

        <section class="tp-panel" aria-labelledby="steps-heading">
          <div class="tp-panel-header">
            <h2 id="steps-heading">How it works</h2>
          </div>
          <ol class="steps tp-panel-body">
            <li
              [class.is-done]="isStepOneDone()"
              [class.is-current]="!isStepOneDone()"
              [attr.aria-current]="!isStepOneDone() ? 'step' : null"
            >
              <strong>Submit your details @if (isStepOneDone()) {<span class="sr-only">(completed)</span>}</strong>
              <span>Date of birth and one identity document.</span>
            </li>
            <li
              [class.is-done]="isStepTwoDone()"
              [class.is-waiting]="isStepTwoWaiting()"
              [class.is-rejected]="isStepTwoRejected()"
              [class.is-current]="isStepTwoWaiting()"
              [attr.aria-current]="isStepTwoWaiting() ? 'step' : null"
            >
              <strong>
                Administrator review
                @if (isStepTwoDone()) {<span class="sr-only">(completed)</span>}
                @if (isStepTwoRejected()) {<span class="sr-only">(rejected)</span>}
              </strong>
              <span>An administrator checks your document.</span>
            </li>
            <li [class.is-done]="isStepThreeDone()">
              <strong>
                Start trading
                @if (isStepThreeDone()) {<span class="sr-only">(completed)</span>}
              </strong>
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
    .steps li.is-waiting::before { content: '…'; color: var(--tp-accent); border-color: var(--tp-accent); }
    .steps li.is-rejected::before { content: '✕'; color: var(--tp-danger); border-color: currentColor; }
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
    dateOfBirth: ['', [Validators.required, minimumAgeValidator(18)]],
    documentType: ['', Validators.required],
    documentNumber: ['', Validators.required]
  });

  protected readonly kycStatus = signal('');
  protected readonly normalizedKycStatus = computed<KycStatus | null>(() => {
    const status = this.kycStatus() as KycStatus | '';
    return status || null;
  });
  protected readonly existingKyc = signal<KycSubmission | null>(null);
  protected readonly isUpdateMode = computed(() => this.existingKyc() !== null);
  protected readonly hasUploadedKyc = computed(() => this.existingKyc() !== null);
  protected readonly isRejected = computed(() => this.normalizedKycStatus() === 'REJECTED');
  protected readonly isStepOneDone = computed(() => this.hasUploadedKyc());
  protected readonly isStepTwoWaiting = computed(() => this.normalizedKycStatus() === 'PENDING');
  protected readonly isStepTwoDone = computed(() => this.normalizedKycStatus() === 'APPROVED');
  protected readonly isStepTwoRejected = computed(() => this.normalizedKycStatus() === 'REJECTED');
  protected readonly isStepThreeDone = computed(() => this.normalizedKycStatus() === 'APPROVED');
  protected readonly isLoadingExistingKyc = signal(true);
  protected readonly justSubmitted = signal(false);
  protected readonly submitted = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected rejectionReason = '';

  ngOnInit(): void {
    this.kycService
      .getCurrentUserKyc()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (kyc) => {
          this.isLoadingExistingKyc.set(false);
          this.existingKyc.set(kyc);
          this.kycStatus.set(kyc?.status ?? '');
          this.rejectionReason = kyc?.rejectionReason ?? '';

          if (kyc) {
            this.form.patchValue({
              dateOfBirth: kyc.dateOfBirth,
              documentType: kyc.documentType,
              documentNumber: kyc.documentNumber,
            });
          }
        },
        error: () => {
          this.isLoadingExistingKyc.set(false);
          this.errorMessage.set('Unable to load your KYC details right now.');
        },
      });
  }

  protected showError(name: 'dateOfBirth' | 'documentType' | 'documentNumber'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected dobErrorMessage(): string {
    const control = this.form.controls.dateOfBirth;
    if (control.hasError('required')) {
      return 'Enter your date of birth.';
    }
    if (control.hasError('minimumAge')) {
      return 'You must be at least 18 years old.';
    }
    return 'Enter a valid date of birth.';
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
        next: (kyc) => {
          this.isLoading.set(false);
          this.justSubmitted.set(true);
          this.existingKyc.set(kyc);
          this.kycStatus.set(kyc.status);
          this.rejectionReason = kyc.rejectionReason ?? '';
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
