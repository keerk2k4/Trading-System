import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';
import { API_CONFIG } from '../../../core/config/api-config';
import { SessionService } from '../../../core/services/session.service';

describe('LoginComponent', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  let session: SessionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionService);
    session.clear();
  });

  afterEach(() => httpMock.verify());

  it('empty fields are blocked by validation', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    component.submit();

    httpMock.expectNone(`${API_CONFIG.authApiBaseUrl}/auth/login`);
    expect(component.form.invalid).toBe(true);
  });

  it('valid credentials sign in and redirect', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    component.form.setValue({ username: 'priya.menon', password: 'correct horse battery staple' });
    component.submit();

    const req = httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
    });

    expect(session.isSignedIn()).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith('/kyc');
  });

  it('invalid credentials show a readable error', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;

    component.form.setValue({ username: 'priya.menon', password: 'wrong-password' });
    component.submit();

    const req = httpMock.expectOne(`${API_CONFIG.authApiBaseUrl}/auth/login`);
    req.flush({ errorCode: 'AUTH-401', message: 'Unauthorised' }, { status: 401, statusText: 'Unauthorized' });

    expect(component.errorMessage()).toBe('The session has expired, or the sign-in was refused.');
    expect(session.isSignedIn()).toBe(false);
  });
});
