import { Injectable, signal, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { KycSubmission, KycStatus } from '../models/kyc.models';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { MockAuthService } from './mock-auth.service';
import { KycResponse } from '../../../generated/auth-client';
import { AUTH_API_BASE_URL } from './mock-auth.service';

@Injectable({
  providedIn: 'root'
})
export class MockKycService {
  private kycStatus = signal<KycStatus | null>(null);
  private http = inject(HttpClient);
  private authService = inject(MockAuthService);

  constructor() {
    this.kycStatus.set(this.loadKycStatusFromStorage());
  }

  // Submits KYC once, then uses PUT /kyc for subsequent edits.
  submitKyc(userId: string, data: any): Observable<KycSubmission> {
    if (!this.authService.getToken()) {
      return throwError(() => ({ errorCode: 'AUTH-401', message: 'Sign in first' }));
    }

    const payload = {
      dateOfBirth: data.dateOfBirth,
      documentType: data.documentType,
      documentNumber: data.documentNumber,
    };

    return this.http.get<KycResponse>(`${AUTH_API_BASE_URL}/kyc`).pipe(
      switchMap(() => this.http.put<KycResponse>(`${AUTH_API_BASE_URL}/kyc`, payload)),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          return this.http.post<KycResponse>(`${AUTH_API_BASE_URL}/kyc`, payload);
        }
        return throwError(() => err);
      }),
      map((response) => this.toKycSubmission(response)),
      tap((kyc) => {
        this.kycStatus.set(kyc.status);
        localStorage.setItem('kyc_status', kyc.status);
      }),
      catchError((err: HttpErrorResponse) =>
        throwError(() => err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' })
      )
    );
  }

  // Get KYC status for current user from backend.
  getKycStatus(userId: string): Observable<KycSubmission | null> {
    return this.http.get<KycResponse>(`${AUTH_API_BASE_URL}/kyc`).pipe(
      map((response) => this.toKycSubmission(response)),
      tap((kyc) => {
        this.kycStatus.set(kyc.status);
        localStorage.setItem('kyc_status', kyc.status);
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.kycStatus.set(null);
          localStorage.removeItem('kyc_status');
          return of(null);
        }
        return throwError(() => err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' });
      })
    );
  }

  getCurrentUserKyc(): Observable<KycSubmission | null> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return of(null);
    }

    return this.getKycStatus(currentUser.id);
  }

  // Get all pending KYC submissions (admin only)
  getPendingKycSubmissions(): Observable<KycSubmission[]> {
    return this.http.get<KycResponse[]>(`${AUTH_API_BASE_URL}/kyc/pending`).pipe(
      map((rows) => rows.map((row) => this.toKycSubmission(row))),
      catchError((err: HttpErrorResponse) =>
        throwError(() => err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' })
      )
    );
  }

  // Review/approve KYC (admin only)
  reviewKyc(userId: string, approved: boolean, reason?: string): Observable<KycSubmission> {
    return this.http
      .patch<KycResponse>(`${AUTH_API_BASE_URL}/kyc`, {
        userId,
        status: approved ? 'APPROVED' : 'REJECTED',
        rejectionReason: approved ? undefined : reason,
      })
      .pipe(
        map((row) => this.toKycSubmission(row)),
        catchError((err: HttpErrorResponse) =>
          throwError(() => err.error ?? { errorCode: 'AUTH-500', message: 'Unexpected error' })
        )
      );
  }

  // Get current KYC status signal.
  getKycStatusSignal() {
    return this.kycStatus.asReadonly();
  }

  // Get KYC status for current user (convenience method)
  getCurrentUserKycStatus(): KycStatus | null {
    return this.kycStatus();
  }

  // Contract KycResponse (numeric id, ISO date strings, nullable review
  // fields) -> the UI's KycSubmission view model.
  private toKycSubmission(response: KycResponse): KycSubmission {
    return {
      id: String(response.id),
      userId: response.userId,
      dateOfBirth: response.dateOfBirth,
      documentType: response.documentType,
      documentNumber: response.documentNumber,
      status: response.status,
      submittedAt: new Date(response.submittedAt),
      reviewedAt: response.reviewedAt ? new Date(response.reviewedAt) : undefined,
      reviewedBy: response.reviewedBy ?? undefined,
      rejectionReason: response.rejectionReason ?? undefined,
    };
  }

  private loadKycStatusFromStorage(): KycStatus | null {
    const stored = localStorage.getItem('kyc_status');
    return (stored as KycStatus) || null;
  }
}
