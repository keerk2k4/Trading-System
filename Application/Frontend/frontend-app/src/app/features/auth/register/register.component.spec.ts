import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { MockAuthService } from '../../../shared/services/auth.service';

const PASSWORD = 'correct horse battery staple';
const VALID_FIELDS = {
  username: 'gaurang123',
  email: 'gaurang@example.com',
  'first-name': 'Gaurang',
  'last-name': 'Patel',
  phone: '+919900112233',
  password: PASSWORD,
  'confirm-password': PASSWORD
};

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<MockAuthService>;
  let fixture: ComponentFixture<RegisterComponent>;
  let page: HTMLElement;

  const errorText = (id: string) => page.querySelector(`#${id}-error`)?.textContent?.trim();
  const byTestId = (id: string) => page.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  function fill(values: Record<string, string>): void {
    for (const [id, value] of Object.entries(values)) {
      const input = page.querySelector<HTMLInputElement>(`#register-${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }

  function click(testId: string): void {
    byTestId(testId)!.click();
    fixture.detectChanges();
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function verifyEmail(): void {
    click('register-send-otp');
    fill({ otp: '123456' });
    click('register-verify-otp');
  }

  beforeEach(() => {
    auth = jasmine.createSpyObj<MockAuthService>('MockAuthService', [
      'register',
      'sendRegistrationOtp',
      'verifyRegistrationOtp'
    ]);
    auth.register.and.returnValue(of({ id: 'user-1', username: 'gaurang123', roles: ['CUSTOMER'] }));
    auth.sendRegistrationOtp.and.returnValue(of({ message: 'sent', expiresIn: 600, resendAfter: 60 }));
    auth.verifyRegistrationOtp.and.returnValue(of({ verificationToken: 'verified-token', expiresIn: 1800 }));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MockAuthService, useValue: auth }]
    });
    fixture = TestBed.createComponent(RegisterComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('reports invalid fields on submit without calling the API', () => {
    fill({
      username: 'bad name!',
      email: 'bad',
      'first-name': '',
      'last-name': '',
      phone: '123',
      password: 'too short',
      'confirm-password': 'different'
    });
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText('register-username')).toBe('Use only letters, numbers, dots, dashes and underscores.');
    expect(errorText('register-email')).toBe('Enter a valid email address.');
    expect(errorText('register-password')).toBe('Password must be at least 12 characters.');
    expect(errorText('register-confirm-password')).toBe('Passwords do not match.');
  });

  it('does not send an OTP for an invalid email', () => {
    fill({ email: 'bad' });
    click('register-send-otp');

    expect(auth.sendRegistrationOtp).not.toHaveBeenCalled();
    expect(errorText('register-email')).toBe('Enter a valid email address.');
  });

  it('refuses to register until the email is verified', () => {
    fill(VALID_FIELDS);
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(byTestId('register-error')?.textContent).toContain('Verify your email address');

    click('register-send-otp');
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(byTestId('register-error')?.textContent).toContain('Enter the verification code');
  });

  it('shows the server error for a wrong OTP and stays unverified', () => {
    auth.verifyRegistrationOtp.and.returnValue(
      throwError(() => ({ errorCode: 'OTP-400', message: 'Incorrect verification code. 4 attempts remaining.', status: 400 }))
    );
    fill(VALID_FIELDS);
    verifyEmail();

    expect(byTestId('register-otp-error')?.textContent?.trim()).toBe('Incorrect verification code. 4 attempts remaining.');
    expect(byTestId('register-email-verified')).toBeNull();

    submit();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('sends a verified registration with the token and without the confirmation field', () => {
    fill(VALID_FIELDS);
    verifyEmail();

    expect(auth.sendRegistrationOtp).toHaveBeenCalledOnceWith('gaurang@example.com');
    expect(auth.verifyRegistrationOtp).toHaveBeenCalledOnceWith('gaurang@example.com', '123456');
    expect(byTestId('register-email-verified')).not.toBeNull();

    submit();

    expect(auth.register).toHaveBeenCalledOnceWith({
      username: 'gaurang123',
      email: 'gaurang@example.com',
      firstName: 'Gaurang',
      lastName: 'Patel',
      phone: '+919900112233',
      password: PASSWORD,
      emailVerificationToken: 'verified-token'
    });
  });

  it('shows a phone number already in use on the phone field', () => {
    auth.register.and.returnValue(
      throwError(() => ({
        errorCode: 'PHONE-409',
        message: 'This phone number is already registered to another account.',
        status: 409
      }))
    );
    fill(VALID_FIELDS);
    verifyEmail();
    submit();

    expect(page.querySelector('#register-phone-error')?.textContent?.trim()).toBe(
      'This phone number is already registered to another account.'
    );
  });

  it('drops the verification when the email is changed', () => {
    fill(VALID_FIELDS);
    verifyEmail();
    click('register-change-email');
    fill({ email: 'other@example.com' });
    submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(byTestId('register-email-verified')).toBeNull();
  });
});
