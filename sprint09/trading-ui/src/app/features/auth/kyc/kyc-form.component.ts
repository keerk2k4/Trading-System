import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../../../shared/navbar/navbar.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';

@Component({
  selector: 'app-kyc-form',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  template: `
    <app-navbar></app-navbar>
    
    <div class="kyc-container">
      <div class="kyc-card card">
        <h1>KYC Verification</h1>
        <p class="subtitle">Complete your Know Your Customer verification to start trading</p>

        <div *ngIf="kycStatus() === 'PENDING'" class="alert alert-info">
          <strong>Application Under Review</strong>
          <p>Your KYC application has been submitted and is awaiting admin approval. You will be notified once your application is reviewed.</p>
          <p><strong>Status:</strong> <span class="badge badge-pending">PENDING</span></p>
        </div>

        <div *ngIf="kycStatus() === 'REJECTED'" class="alert alert-error">
          <strong>Application Rejected</strong>
          <p>{{ rejectionReason }}</p>
          <p>Please contact support or resubmit your application with correct information.</p>
        </div>

        <div *ngIf="errorMessage()" class="alert alert-error">
          {{ errorMessage() }}
        </div>

        <div *ngIf="successMessage()" class="alert alert-success">
          {{ successMessage() }}
          <p><strong>Status:</strong> <span class="badge badge-pending">PENDING</span></p>
          <p>Your application has been submitted for review. An admin will review it shortly.</p>
        </div>

        <form (ngSubmit)="onSubmit()" #kycForm="ngForm" *ngIf="kycStatus() !== 'PENDING' && !successMessage()">
          <div class="form-group">
            <label for="dob">Date of Birth</label>
            <input
              type="date"
              id="dob"
              name="dateOfBirth"
              [(ngModel)]="dateOfBirth"
              required
            />
          </div>

          <div class="form-group">
            <label for="docType">Document Type</label>
            <select id="docType" name="documentType" [(ngModel)]="documentType" required>
              <option value="" disabled>Select document type</option>
              <option value="PASSPORT">Passport</option>
              <option value="AADHAR">Aadhar</option>
              <option value="DRIVER_LICENSE">Driver License</option>
              <option value="PAN">PAN Card</option>
            </select>
          </div>

          <div class="form-group">
            <label for="docNum">Document Number</label>
            <input
              type="text"
              id="docNum"
              name="documentNumber"
              [(ngModel)]="documentNumber"
              required
              placeholder="Enter your document number"
            />
          </div>

          <button type="submit" class="btn-primary" [disabled]="isLoading()">
            {{ isLoading() ? 'Submitting...' : 'Submit KYC' }}
          </button>
        </form>

        <div class="kyc-info" *ngIf="successMessage()">
          <button class="btn-primary" (click)="goToDashboard()">
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kyc-container {
      max-width: 500px;
      margin: var(--spacing-2xl) auto;
      padding: var(--spacing-lg);
    }

    .kyc-card {
      background-color: white;
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

    .alert p {
      margin: var(--spacing-sm) 0 0 0;
    }

    .kyc-info {
      text-align: center;
      margin-top: var(--spacing-lg);
    }

    .badge {
      margin-left: var(--spacing-sm);
    }
  `]
})
export class KycFormComponent implements OnInit {
  dateOfBirth = '';
  documentType = '';
  documentNumber = '';

  errorMessage = signal<string>('');
  successMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  kycStatus = signal<string>('');
  rejectionReason = '';

  constructor(
    private kycService: MockKycService,
    private authService: MockAuthService,
    private errorMapping: ErrorMappingService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check current KYC status
    const currentStatus = this.kycService.getCurrentUserKycStatus();
    this.kycStatus.set(currentStatus || '');
  }

  onSubmit(): void {
    if (!this.dateOfBirth || !this.documentType || !this.documentNumber) {
      this.errorMessage.set('All fields are required');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const user = this.authService.getCurrentUser();
    if (!user) {
      this.errorMessage.set('No authenticated user found');
      return;
    }

    this.kycService.submitKyc(user.id, {
      dateOfBirth: this.dateOfBirth,
      documentType: this.documentType,
      documentNumber: this.documentNumber
    }).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.kycStatus.set('PENDING');
        this.successMessage.set('KYC submitted successfully!');
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(this.errorMapping.getErrorMessage(err.errorCode));
      }
    });
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
