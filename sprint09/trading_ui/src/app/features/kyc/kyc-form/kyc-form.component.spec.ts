import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { KycFormComponent } from './kyc-form.component';
import { API_CONFIG } from '../../../core/config/api-config';
import { SessionService } from '../../../core/services/session.service';

describe('KycFormComponent', () => {
  let httpMock: HttpTestingController;
  let session: SessionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => {
    httpMock.verify();
    session.clear();
  });

  it('refuses to submit when signed out', () => {
    session.clear();
    const fixture = TestBed.createComponent(KycFormComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ dateOfBirth: '1996-02-14', documentType: 'PASSPORT', documentNumber: 'P1234567' });
    component.submit();

    httpMock.expectNone(`${API_CONFIG.authApiBaseUrl}/kyc`);
    expect(component.errorMessage()).toContain('Sign in first');
  });

  it('attaches the bearer token when signed in and submits', () => {
    session.setTokens({ accessToken: 'a-real-token', refreshToken: 'r' });
    const fixture = TestBed.createComponent(KycFormComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ dateOfBirth: '1996-02-14', documentType: 'PASSPORT', documentNumber: 'P1234567' });
    component.submit();

    const req = httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/kyc`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer a-real-token');
    req.flush({
      id: 1,
      userId: 'user-1',
      status: 'PENDING',
      dateOfBirth: '1996-02-14',
      documentType: 'PASSPORT',
      documentNumber: 'P1234567',
      submittedAt: '2026-09-29T00:00:00Z',
    });

    expect(component.successMessage()).toContain('PENDING');
  });
});
