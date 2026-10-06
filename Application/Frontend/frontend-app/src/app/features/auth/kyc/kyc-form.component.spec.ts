import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KycFormComponent } from './kyc-form.component';
import { MockAuthService } from '../../../shared/services/auth.service';
import { MockKycService } from '../../../shared/services/kyc.service';

describe('KycFormComponent', () => {
  let kyc: jasmine.SpyObj<MockKycService>;
  let fixture: ComponentFixture<KycFormComponent>;
  let page: HTMLElement;

  function set(id: string, value: string, event = 'input'): void {
    const control = page.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    control.value = value;
    control.dispatchEvent(new Event(event));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    kyc = jasmine.createSpyObj<MockKycService>('MockKycService', ['getCurrentUserKycStatus', 'getCurrentUserKyc', 'submitKyc']);
    kyc.getCurrentUserKycStatus.and.returnValue(null);
    kyc.getCurrentUserKyc.and.returnValue(of(null));
    kyc.submitKyc.and.returnValue(
      of({ userId: 'u-1', dateOfBirth: '', documentType: '', documentNumber: '', status: 'PENDING' })
    );

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MockKycService, useValue: kyc },
        { provide: MockAuthService, useValue: { getCurrentUser: () => ({ id: 'u-1' }) } }
      ]
    });
    fixture = TestBed.createComponent(KycFormComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('requires every field before submitting', () => {
    submit();

    expect(kyc.submitKyc).not.toHaveBeenCalled();
    expect(page.querySelectorAll('.tp-field-error').length).toBe(3);
  });

  it('submits the details for the signed-in user', () => {
    set('dob', '1990-05-15');
    set('docType', 'PASSPORT', 'change');
    set('docNum', 'PS123456789');
    submit();

    expect(kyc.submitKyc).toHaveBeenCalledOnceWith('u-1', {
      dateOfBirth: '1990-05-15',
      documentType: 'PASSPORT',
      documentNumber: 'PS123456789'
    });
  });

  it('blocks submission when user is under 18', () => {
    const underageYear = new Date().getFullYear() - 17;
    set('dob', `${underageYear}-01-01`);
    set('docType', 'PASSPORT', 'change');
    set('docNum', 'PS123456789');
    submit();

    expect(kyc.submitKyc).not.toHaveBeenCalled();
    expect(page.querySelector('[data-testid="dob-error"]')?.textContent).toContain('at least 18 years old');
  });

  it('disables future dates in the date picker', () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    expect(page.querySelector<HTMLInputElement>('#dob')!.max).toBe(today);
  });

  it('blocks a typed future date of birth with a clear message', () => {
    set('dob', `${new Date().getFullYear() + 1}-01-01`);
    set('docType', 'PASSPORT', 'change');
    set('docNum', 'PS123456789');
    submit();

    expect(kyc.submitKyc).not.toHaveBeenCalled();
    expect(page.querySelector('[data-testid="dob-error"]')?.textContent?.trim()).toBe(
      'Date of birth cannot be a future date. Select today or an earlier date.'
    );
  });

  it('shows a rejected marker on step 2 when KYC is rejected', () => {
    kyc.getCurrentUserKyc.and.returnValue(
      of({
        userId: 'u-1',
        dateOfBirth: '1990-05-15',
        documentType: 'PASSPORT',
        documentNumber: 'PS123456789',
        status: 'REJECTED',
        rejectionReason: 'Document mismatch'
      })
    );

    fixture = TestBed.createComponent(KycFormComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();

    const stepTwo = page.querySelectorAll<HTMLLIElement>('.steps li')[1];
    const stepThree = page.querySelectorAll<HTMLLIElement>('.steps li')[2];
    expect(stepTwo.classList.contains('is-rejected')).toBeTrue();
    expect(stepThree.classList.contains('is-rejected')).toBeFalse();
  });
});
