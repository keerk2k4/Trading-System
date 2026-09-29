import { Injectable, signal, inject } from '@angular/core';
import { KycSubmission, KycStatus } from '../models/kyc.models';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { MockAuthService } from './mock-auth.service';

@Injectable({
  providedIn: 'root'
})
export class MockKycService {
  private kycDatabase = new Map<string, KycSubmission>();
  private kycStatus = signal<KycStatus | null>(null);
  private authService = inject(MockAuthService);

  constructor() {
    this.initializeMockData();
    this.initializeCurrentUserKycStatus();
  }

  private initializeCurrentUserKycStatus(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      const userKyc = this.kycDatabase.get(currentUser.id);
      if (userKyc) {
        this.kycStatus.set(userKyc.status);
        localStorage.setItem('kyc_status', userKyc.status);
      }
    }
  }

  // Submit KYC
  submitKyc(userId: string, data: any): Observable<KycSubmission> {
    return new Observable(observer => {
      setTimeout(() => {
        const kyc: KycSubmission = {
          id: 'KYC-' + this.generateId(),
          userId,
          dateOfBirth: data.dateOfBirth,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          status: 'PENDING',
          submittedAt: new Date()
        };

        this.kycDatabase.set(userId, kyc);
        this.kycStatus.set('PENDING');
        localStorage.setItem('kyc_status', 'PENDING');

        observer.next(kyc);
        observer.complete();
      }, 800);
    });
  }

  // Get KYC status for current user
  getKycStatus(userId: string): Observable<KycSubmission | null> {
    return of(this.kycDatabase.get(userId) || null).pipe(delay(300));
  }

  // Get all pending KYC submissions (admin only)
  getPendingKycSubmissions(): Observable<KycSubmission[]> {
    const pending = Array.from(this.kycDatabase.values()).filter(k => k.status === 'PENDING');
    return of(pending).pipe(delay(500));
  }

  // Review/approve KYC (admin only)
  reviewKyc(kycId: string, approved: boolean, reason?: string): Observable<any> {
    return new Observable(observer => {
      setTimeout(() => {
        // Find and update KYC
        for (const [userId, kyc] of this.kycDatabase.entries()) {
          if (kyc.id === kycId) {
            kyc.status = approved ? 'APPROVED' : 'REJECTED';
            kyc.reviewedAt = new Date();
            kyc.reviewedBy = 'admin-user'; // Mock admin
            if (reason) {
              kyc.rejectionReason = reason;
            }

            if (approved) {
              localStorage.setItem('kyc_status', 'APPROVED');
              this.kycStatus.set('APPROVED');
            } else {
              localStorage.setItem('kyc_status', 'REJECTED');
              this.kycStatus.set('REJECTED');
            }

            observer.next({ success: true, kyc });
            observer.complete();
            return;
          }
        }

        observer.error({
          errorCode: 'VAL-422',
          message: 'KYC not found'
        });
      }, 600);
    });
  }

  // Get current KYC status signal (looks up current user)
  getKycStatusSignal() {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return signal<KycStatus | null>(null).asReadonly();
    }
    const userKyc = this.kycDatabase.get(currentUser.id);
    const status = userKyc ? userKyc.status : null;
    return signal<KycStatus | null>(status).asReadonly();
  }

  // Get KYC status for current user (convenience method)
  getCurrentUserKycStatus(): KycStatus | null {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return null;
    }
    const userKyc = this.kycDatabase.get(currentUser.id);
    return userKyc ? userKyc.status : null;
  }

  private initializeMockData(): void {
    // Initialize with one mock KYC submission for admin.user
    const mockKyc: KycSubmission = {
      id: 'KYC-00001',
      userId: 'a1b2c3d4-e5f6-4a5b-6c7d-8e9f0a1b2c3d', // admin.user's actual ID
      dateOfBirth: '1990-05-15',
      documentType: 'PASSPORT',
      documentNumber: 'PS123456789',
      status: 'PENDING',
      submittedAt: new Date()
    };

    this.kycDatabase.set('a1b2c3d4-e5f6-4a5b-6c7d-8e9f0a1b2c3d', mockKyc);

    // Add approved user (trader.user)
    const approvedKyc: KycSubmission = {
      id: 'KYC-00002',
      userId: 'b2c3d4e5-f6a7-5b6c-7d8e-9f0a1b2c3d4e', // trader.user's actual ID
      dateOfBirth: '1992-08-20',
      documentType: 'AADHAR',
      documentNumber: 'AADH12345678',
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 86400000),
      reviewedAt: new Date(Date.now() - 43200000),
      reviewedBy: 'admin.user'
    };

    this.kycDatabase.set('b2c3d4e5-f6a7-5b6c-7d8e-9f0a1b2c3d4e', approvedKyc);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private loadKycStatusFromStorage(): KycStatus | null {
    const stored = localStorage.getItem('kyc_status');
    return (stored as KycStatus) || null;
  }
}
