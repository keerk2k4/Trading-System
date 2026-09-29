import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { API_CONFIG } from '../config/api-config';
import { CreateKycRequest, KycResponse } from '../models/auth.models';
import { SessionService } from './session.service';

/**
 * Interim, hand-written wrapper around POST /kyc.
 *
 * `/kyc` is a protected route (BearerGuard on the server side), so this
 * service attaches the Authorization header itself, by hand, for now.
 * That is a deliberate stopgap, not the graded interceptor: the "Bearer
 * Token Interceptor" story asks for one functional interceptor, registered
 * once, that every request goes through and that decides whether to attach
 * the header by comparing the outgoing URL against your configured platform
 * origins — with two named unit tests. Once that interceptor exists, delete
 * the manual header below; the interceptor should be the only place in the
 * app that sets Authorization.
 */
@Injectable({ providedIn: 'root' })
export class KycApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly baseUrl = API_CONFIG.authApiBaseUrl;

  submit(request: CreateKycRequest): Observable<KycResponse> {
    const token = this.session.accessToken();
    if (!token) {
      return throwError(() => new Error('Not signed in'));
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post<KycResponse>(`${this.baseUrl}/kyc`, request, { headers });
  }
}
