import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { KycSubmission, KycStatus } from '../models/kyc.models';
import { Observable, of, throwError } from 'rxjs';
import { catchError, delay, tap } from 'rxjs/operators';
import { MockAuthService } from './mock-auth.service';

// Same real auth-service the KYC endpoints live on (see mock-auth.service.ts).
const AUTH_API_BASE_URL = 'http://localhost:3000';

@Injectable({
  providedIn: 'root'
})
export class MockKycService {
  private kycDatabase = new Map<string, KycSubmission>();
  private kycStatus = signal<KycStatus | null>(null);
  private authService = inject(MockAuthService);
  private http = inject(HttpClient);

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

  // Submit KYC against the real backend: POST /kyc, bearer-authenticated
  // with the signed-in user's own access token. The real endpoint takes the
  // user from that token, not from a body field, so `userId` is only used
  // here to key the local kycStatus signal/localStorage the rest of the UI
  // already reads - the same local bookkeeping the mock version did.
  submitKyc(userId: string, data: any): Observable<KycSubmission> {
    const token = this.authService.getToken();
    if (!token) {
      return throwError(() => ({ errorCode: 'AUTH-401', message: 'Sign in first' }));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });

    return this.http
      .post<KycSubmission>(
        `${AUTH_API_BASE_URL}/kyc`,
        {
          dateOfBirth: data.dateOfBirth,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
        },
        { headers }
      )
      .pipe(
        tap((kyc) => {
          // Same local bookkeeping the mock version kept, so the rest of
          // the app (login redirect, dashboard) still has something to read
          // until a real "get my KYC status" endpoint exists (see PR notes).
          this.kycDatabase.set(userId, kyc);
          this.kycStatus.set('PENDING');
          localStorage.setItem('kyc_status', 'PENDING');
        }),
        catchError((err: HttpErrorResponse) => {
          throw err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' };
        })
      );
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

  private loadKycStatusFromStorage(): KycStatus | null {
    const stored = localStorage.getItem('kyc_status');
    return (stored as KycStatus) || null;
  }
}
