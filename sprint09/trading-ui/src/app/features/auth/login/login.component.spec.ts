import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LoginComponent } from './login.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { ErrorMappingService } from '../../../shared/services/error-mapping.service';

describe('LoginComponent', () => {
  let isAdmin: boolean;
  let queryParams: Record<string, string>;
  let router: Router;

  beforeEach(() => {
    isAdmin = false;
    queryParams = {};
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        {
          provide: MockAuthService,
          useValue: { login: () => of({}), isAdmin: () => isAdmin }
        },
        { provide: MockKycService, useValue: { getKycStatusSignal: () => signal('APPROVED') } },
        { provide: ErrorMappingService, useValue: { getErrorMessage: () => '' } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { get queryParams() { return queryParams; }, data: {} } }
        }
      ]
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });

  const signIn = () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    component.username = 'priya.menon';
    component.password = 'secret';
    component.onLogin();
  };

  it('lands the user where they were going after signing in', () => {
    queryParams = { returnUrl: '/orders/history' };

    signIn();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/orders/history');
  });

  it('refuses an off-origin return address and goes to the dashboard instead', () => {
    queryParams = { returnUrl: 'https://evil.example/login' };

    signIn();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('refuses a protocol-relative return address', () => {
    queryParams = { returnUrl: '//evil.example' };

    signIn();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('lands an admin where they were going after signing in', () => {
    isAdmin = true;
    queryParams = { returnUrl: '/admin/kyc-review' };

    signIn();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/kyc-review');
  });

  it('sends an admin with no return address to the admin dashboard', () => {
    isAdmin = true;

    signIn();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/dashboard');
  });
});
