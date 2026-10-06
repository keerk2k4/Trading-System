import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';
import { MockAuthService } from '../../../shared/services/auth.service';

const NEW_PASSWORD = 'a brand new long password';
const SENT_MESSAGE = 'If an account with that username exists, a verification code has been sent to its registered email address.';

describe('ForgotPasswordComponent', () => {
  let auth: jasmine.SpyObj<MockAuthService>;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let page: HTMLElement;

  const byTestId = (id: string) => page.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  function fill(values: Record<string, string>): void {
    for (const [id, value] of Object.entries(values)) {
      const input = page.querySelector<HTMLInputElement>(`#forgot-${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function reachResetStep(): void {
    fill({ username: 'alice.trader' });
    submit();
    fill({ otp: '654321' });
    submit();
  }

  beforeEach(() => {
    auth = jasmine.createSpyObj<MockAuthService>('MockAuthService', [
      'requestPasswordReset',
      'verifyPasswordResetOtp',
      'resetPassword'
    ]);
    auth.requestPasswordReset.and.returnValue(of({ message: SENT_MESSAGE, expiresIn: 600, resendAfter: 60 }));
    auth.verifyPasswordResetOtp.and.returnValue(of({ verificationToken: 'reset-tok', expiresIn: 1800 }));
    auth.resetPassword.and.returnValue(of({ message: 'Your password has been changed.' }));

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MockAuthService, useValue: auth }]
    });
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('requires a username before sending a code', () => {
    submit();

    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    expect(byTestId('forgot-username-error')?.textContent?.trim()).toBe('Enter your username.');
  });

  it('sends the code and shows the server message', () => {
    fill({ username: 'alice.trader' });
    submit();

    expect(auth.requestPasswordReset).toHaveBeenCalledOnceWith('alice.trader');
    expect(byTestId('forgot-code-sent')?.textContent?.trim()).toBe(SENT_MESSAGE);
    expect(byTestId('forgot-otp')).not.toBeNull();
  });

  it('shows the server error for a wrong code and stays on the code step', () => {
    auth.verifyPasswordResetOtp.and.returnValue(
      throwError(() => ({ errorCode: 'OTP-400', message: 'Incorrect verification code. 4 attempts remaining.', status: 400 }))
    );
    reachResetStep();

    expect(byTestId('forgot-otp-error')?.textContent?.trim()).toBe('Incorrect verification code. 4 attempts remaining.');
    expect(byTestId('forgot-new-password')).toBeNull();
  });

  it('rejects mismatched passwords without calling the API', () => {
    reachResetStep();
    fill({ 'new-password': NEW_PASSWORD, 'confirm-password': 'something else entirely' });
    submit();

    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(byTestId('forgot-confirm-password-error')?.textContent?.trim()).toBe('Passwords do not match.');
  });

  it('changes the password with the reset token', () => {
    reachResetStep();
    expect(auth.verifyPasswordResetOtp).toHaveBeenCalledOnceWith('alice.trader', '654321');

    fill({ 'new-password': NEW_PASSWORD, 'confirm-password': NEW_PASSWORD });
    submit();

    expect(auth.resetPassword).toHaveBeenCalledOnceWith('alice.trader', 'reset-tok', NEW_PASSWORD);
    expect(byTestId('forgot-success')).not.toBeNull();
  });

  it('goes back to the first step when the reset token has expired', () => {
    auth.resetPassword.and.returnValue(
      throwError(() => ({ errorCode: 'OTP-403', message: 'Your password reset session is invalid or has expired. Request a new code.', status: 403 }))
    );
    reachResetStep();
    fill({ 'new-password': NEW_PASSWORD, 'confirm-password': NEW_PASSWORD });
    submit();

    expect(byTestId('forgot-username')).not.toBeNull();
    expect(byTestId('forgot-error')?.textContent?.trim()).toBe(
      'Your password reset session is invalid or has expired. Request a new code.'
    );
  });
});
