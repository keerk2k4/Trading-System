import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { MockAuthService } from '../../../shared/services/auth.service';
import { MockKycService } from '../../../shared/services/kyc.service';
import { AuthResponse } from '../../../shared/models/auth.models';
import { KycStatus } from '../../../shared/models/kyc.models';

@Component({ template: '' })
class BlankComponent {}

describe('LoginComponent', () => {
  let auth: jasmine.SpyObj<MockAuthService>;
  let kycStatus: KycStatus | null;
  let kyc: jasmine.SpyObj<MockKycService>;
  let harness: RouterTestingHarness;
  let page: HTMLElement;

  const input = (id: string) => page.querySelector<HTMLInputElement>(`#${id}`)!;
  const alertText = () => page.querySelector('[role="alert"]')?.textContent?.trim();

  function type(id: string, value: string): void {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    harness.detectChanges();
  }

  async function open(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    page = harness.routeNativeElement!;
  }

  beforeEach(() => {
    kycStatus = 'APPROVED';
    auth = jasmine.createSpyObj<MockAuthService>('MockAuthService', ['login', 'isAdmin', 'getCurrentUser']);
    auth.login.and.returnValue(of({} as AuthResponse));
    auth.isAdmin.and.returnValue(false);
    auth.getCurrentUser.and.returnValue({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });
    kyc = jasmine.createSpyObj<MockKycService>('MockKycService', ['getCurrentUserKycStatus', 'getKycStatus']);
    kyc.getCurrentUserKycStatus.and.callFake(() => kycStatus);
    kyc.getKycStatus.and.callFake(() =>
      of(
        kycStatus
          ? { userId: 'u-1', dateOfBirth: '1990-05-15', documentType: 'PASSPORT', documentNumber: 'PS123', status: kycStatus }
          : null
      )
    );

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: LoginComponent },
          { path: 'admin-login', component: LoginComponent, data: { isAdmin: true } },
          { path: '**', component: BlankComponent }
        ]),
        { provide: MockAuthService, useValue: auth },
        { provide: MockKycService, useValue: kyc }
      ]
    });
  });

  it('reports missing fields on submit without calling the API', async () => {
    await open('/login');
    submit();

    expect(auth.login).not.toHaveBeenCalled();
    expect(input('login-username').getAttribute('aria-invalid')).toBe('true');
    expect(input('login-username').getAttribute('aria-describedby')).toBe('login-username-error');
    expect(page.querySelector('#login-username-error')?.textContent).toContain('Enter your username.');
    expect(page.querySelector('#login-password-error')?.textContent).toContain('Enter your password.');
    expect(document.activeElement).toBe(input('login-username'));
  });

  it('does not show an admin sign-in shortcut on customer login', async () => {
    await open('/login');

    expect(page.querySelector('[data-testid="login-admin-link"]')).toBeNull();
  });

  it('signs in through the auth service and opens the dashboard', async () => {
    await open('/login');
    type('login-username', 'gaurang123');
    type('login-password', 'correct horse battery staple');
    submit();
    await harness.fixture.whenStable();

    expect(auth.login).toHaveBeenCalledOnceWith(
      { username: 'gaurang123', password: 'correct horse battery staple' },
      false
    );
    expect(kyc.getKycStatus).toHaveBeenCalledOnceWith('u-1');
    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });

  it('returns to the page the guard interrupted', async () => {
    await open('/login?returnUrl=%2Forders%2Fhistory');
    type('login-username', 'gaurang123');
    type('login-password', 'pw');
    submit();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/orders/history');
  });

  it('rejects off-origin returnUrl and falls back to dashboard', async () => {
    await open('/login?returnUrl=https%3A%2F%2Fevil.example%2Flogin');
    type('login-username', 'gaurang123');
    type('login-password', 'pw');
    submit();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });

  it('shows a generic message for refused credentials, not the raw backend error', async () => {
    auth.login.and.returnValue(throwError(() => ({ errorCode: 'AUTH-401', message: 'Unauthorised', status: 401 })));
    await open('/login');
    type('login-username', 'gaurang123');
    type('login-password', 'wrong password');
    submit();

    expect(alertText()).toBe('Incorrect username or password. Check your details and try again.');
    expect(alertText()).not.toContain('Unauthorised');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('shows a connection message when the auth service is unreachable', async () => {
    auth.login.and.returnValue(throwError(() => ({ errorCode: '', message: 'Unexpected error', status: 0 })));
    await open('/login');
    type('login-username', 'gaurang123');
    type('login-password', 'pw');
    submit();

    expect(alertText()).toContain('Unable to connect');
  });
});
