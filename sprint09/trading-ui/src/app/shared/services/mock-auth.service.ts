import { Injectable, signal } from '@angular/core';
import { User, AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.models';
import { Observable, of, delay } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MockAuthService {
  private currentUser = signal<User | null>(this.loadFromStorage());
  public currentUser$ = this.currentUser.asReadonly();

  // Mock users database
  private mockUsers: { [key: string]: User & { password: string } } = {
    'priya.menon': {
      id: '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f',
      username: 'priya.menon',
      password: 'Test@123456',
      accountId: 1,
      roles: ['CUSTOMER']
    },
    'admin.user': {
      id: 'a1b2c3d4-e5f6-4a5b-6c7d-8e9f0a1b2c3d',
      username: 'admin.user',
      password: 'Admin@123456',
      accountId: 2,
      roles: ['ADMIN']
    },
    'trader.user': {
      id: 'b2c3d4e5-f6a7-5b6c-7d8e-9f0a1b2c3d4e',
      username: 'trader.user',
      password: 'Trader@123456',
      accountId: 3,
      roles: ['CUSTOMER']
    }
  };

  constructor() {}

  register(data: RegisterRequest): Observable<any> {
    // Simulate network delay
    return new Observable(observer => {
      setTimeout(() => {
        // Check if username already exists
        if (this.mockUsers[data.username]) {
          observer.error({
            errorCode: 'AUTH-409',
            message: 'Username already registered'
          });
          return;
        }

        // Validate password match
        if (data.password !== data.confirmPassword) {
          observer.error({
            errorCode: 'VAL-422',
            message: 'Passwords do not match'
          });
          return;
        }

        // Auto-generate accountId (backend provision)
        const autoAccountId = Math.floor(Math.random() * 10000) + 1000;

        // Create new user
        const newUser: User & { password: string } = {
          id: this.generateId(),
          username: data.username,
          password: data.password,
          accountId: autoAccountId,
          roles: ['CUSTOMER']
        };

        this.mockUsers[data.username] = newUser;

        // Return UserResponse (registration only, no tokens)
        const response = {
          id: newUser.id,
          username: newUser.username,
          accountId: newUser.accountId,
          roles: newUser.roles,
          createdOn: new Date().toISOString()
        };

        observer.next(response);
        observer.complete();
      }, 500);
    });
  }

  login(data: LoginRequest): Observable<AuthResponse> {
    return new Observable(observer => {
      setTimeout(() => {
        const user = this.mockUsers[data.username];

        // Uniform failure for unknown user or wrong password
        if (!user || user.password !== data.password) {
          observer.error({
            errorCode: 'AUTH-401',
            message: 'Unauthorised'
          });
          return;
        }

        // Generate mock tokens
        const accessToken = this.generateMockToken(user);
        const refreshToken = this.generateRefreshToken();

        const response: AuthResponse = {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: 900, // 15 minutes
          user: { ...user, password: undefined } as any
        };

        // Store in localStorage
        this.storeToLocalStorage(response);
        this.currentUser.set(response.user);

        observer.next(response);
        observer.complete();
      }, 800);
    });
  }

  logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    localStorage.removeItem('kyc_status');
    this.currentUser.set(null);
  }

  getCurrentUser(): User | null {
    return this.currentUser();
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return !!token;
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  // Decode JWT token to extract payload
  decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const decoded = JSON.parse(atob(parts[1]));
      return decoded;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  // Get roles from current token
  getRolesFromToken(): string[] {
    const token = this.getToken();
    if (!token) {
      return [];
    }
    const payload = this.decodeToken(token);
    return payload?.roles || [];
  }

  // Check if user is admin
  isAdmin(): boolean {
    const roles = this.getRolesFromToken();
    return roles.includes('ADMIN');
  }

  private generateMockToken(user: User & { password: string }): string {
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'; // {alg: HS256, typ: JWT}
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      accountId: user.accountId,
      roles: user.roles,
      iat: now,
      exp: now + 900, // 15 minutes
      iss: 'auth-service'
    };

    const encodedPayload = btoa(JSON.stringify(payload));
    const signature = 'mock_signature'; // In real scenario, would be HMAC-SHA256

    return `${header}.${encodedPayload}.${signature}`;
  }

  private generateRefreshToken(): string {
    return 'refresh_' + this.generateId();
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private storeToLocalStorage(response: AuthResponse): void {
    localStorage.setItem('auth_token', response.accessToken);
    localStorage.setItem('current_user', JSON.stringify(response.user));
  }

  private loadFromStorage(): User | null {
    const stored = localStorage.getItem('current_user');
    return stored ? JSON.parse(stored) : null;
  }
}
