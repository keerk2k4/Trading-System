import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api-config';
import { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from '../models/auth.models';

/**
 * Interim, hand-written wrapper around the auth-service's public endpoints.
 *
 * This exists as a stand-in for the generated client (see the note in
 * auth.models.ts). It intentionally calls only the three unauthenticated
 * endpoints — register, login, admin/login — none of which take a bearer
 * header, matching `security: []` on those operations in
 * contracts/auth-api.yaml.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = API_CONFIG.authApiBaseUrl;

  register(request: RegisterRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(`${this.baseUrl}/auth/register`, request);
  }

  login(request: LoginRequest): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.baseUrl}/auth/login`, request);
  }

  adminLogin(request: LoginRequest): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.baseUrl}/auth/admin/login`, request);
  }
}
