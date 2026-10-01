import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
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

  it('labels both fields and links to registration', async () => {
    await open('/login');

    expect(page.querySelector('h1')?.textContent).toContain('Welcome back');
    expect(page.querySelector('label[for="login-username"]')?.textContent).toContain('Username');
    expect(page.querySelector('label[for="login-password"]')?.textContent).toContain('Password');
    expect(page.querySelector('a[href="/register"]')).not.toBeNull();
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

  it('sends a customer without approved KYC to the KYC form', async () => {
    kycStatus = null;
    await open('/login');
    type('login-username', 'gaurang123');
    type('login-password', 'pw');
    submit();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/kyc-submission');
  });

  it('uses the admin endpoint on /admin-login and opens the admin dashboard', async () => {
    auth.isAdmin.and.returnValue(true);
    await open('/admin-login');
    type('login-username', 'ops');
    type('login-password', 'pw');
    submit();
    await harness.fixture.whenStable();

    expect(auth.login).toHaveBeenCalledOnceWith({ username: 'ops', password: 'pw' }, true);
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
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

  it('shows a loading state and ignores a second submit while signing in', async () => {
    const pending = new Subject<AuthResponse>();
    auth.login.and.returnValue(pending);
    await open('/login');
    type('login-username', 'gaurang123');
    type('login-password', 'pw');
    submit();
    submit();

    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.textContent).toContain('Signing in');
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Signing in');
  });

  it('toggles password visibility with an accessible control', async () => {
    await open('/login');
    const toggle = page.querySelector<HTMLButtonElement>('.tp-input-action')!;
    expect(input('login-password').type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Show password');

    toggle.click();
    harness.detectChanges();

    expect(input('login-password').type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
  });
});
