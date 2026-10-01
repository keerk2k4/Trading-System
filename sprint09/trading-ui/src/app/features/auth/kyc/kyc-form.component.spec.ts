import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KycFormComponent } from './kyc-form.component';
import { MockAuthService } from '../../../shared/services/mock-auth.service';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { KycStatus } from '../../../shared/models/kyc.models';

describe('KycFormComponent', () => {
  let kyc: jasmine.SpyObj<MockKycService>;
  let fixture: ComponentFixture<KycFormComponent>;
  let page: HTMLElement;

  function create(status: KycStatus | null): void {
    kyc = jasmine.createSpyObj<MockKycService>('MockKycService', ['getCurrentUserKycStatus', 'getCurrentUserKyc', 'submitKyc']);
    kyc.getCurrentUserKycStatus.and.returnValue(status);
    kyc.getCurrentUserKyc.and.returnValue(
      of(
        status
          ? {
              userId: 'u-1',
              dateOfBirth: '1990-05-15',
              documentType: 'PASSPORT',
              documentNumber: 'PS123456789',
              status,
            }
          : null
      )
    );
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
  }

  function set(id: string, value: string, event = 'input'): void {
    const control = page.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
    control.value = value;
    control.dispatchEvent(new Event(event));
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('requires every field before submitting', () => {
    create(null);
    submit();

    expect(kyc.submitKyc).not.toHaveBeenCalled();
    expect(page.querySelectorAll('.tp-field-error').length).toBe(3);
    expect(document.activeElement?.id).toBe('dob');
  });

  it('submits the details and switches to the review state', () => {
    create(null);
    set('dob', '1990-05-15');
    set('docType', 'PASSPORT', 'change');
    set('docNum', 'PS123456789');
    submit();

    expect(kyc.submitKyc).toHaveBeenCalledOnceWith('u-1', {
      dateOfBirth: '1990-05-15',
      documentType: 'PASSPORT',
      documentNumber: 'PS123456789'
    });
    expect(page.querySelector('form')).not.toBeNull();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('updated');
    expect(page.querySelector('[aria-current="step"]')?.textContent).toContain('Administrator review');
  });

  it('shows existing pending KYC and keeps the form open for updates', () => {
    create('PENDING');

    expect(page.querySelector('form')).not.toBeNull();
    expect(page.textContent).toContain('already have a submitted KYC');
    expect((page.querySelector('#dob') as HTMLInputElement).value).toBe('1990-05-15');
    expect(page.querySelector('button[type="submit"]')?.textContent).toContain('Update submission');
  });

  it('explains a rejection and offers the form again', () => {
    create('REJECTED');

    expect(page.querySelector('form')).not.toBeNull();
    expect(page.textContent).toContain('previous application was rejected');
  });
});
