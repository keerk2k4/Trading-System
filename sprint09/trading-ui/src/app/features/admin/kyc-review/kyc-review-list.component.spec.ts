import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { KycReviewListComponent } from './kyc-review-list.component';
import { MockKycService } from '../../../shared/services/mock-kyc.service';
import { KycSubmission } from '../../../shared/models/kyc.models';

const SUBMISSION: KycSubmission = {
  id: 'KYC-1',
  userId: 'u-1',
  dateOfBirth: '1990-05-15',
  documentType: 'PASSPORT',
  documentNumber: 'PS123',
  status: 'PENDING'
};

describe('KycReviewListComponent', () => {
  let kyc: jasmine.SpyObj<MockKycService>;
  let fixture: ComponentFixture<KycReviewListComponent>;
  let page: HTMLElement;

  const button = (label: string) =>
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;

  beforeEach(() => {
    kyc = jasmine.createSpyObj<MockKycService>('MockKycService', ['getPendingKycSubmissions', 'reviewKyc']);
    kyc.getPendingKycSubmissions.and.returnValue(of([SUBMISSION]));
    kyc.reviewKyc.and.returnValue(of({ ...SUBMISSION, status: 'APPROVED' }));

    TestBed.configureTestingModule({ providers: [{ provide: MockKycService, useValue: kyc }] });
    fixture = TestBed.createComponent(KycReviewListComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows each pending submission with its details', () => {
    expect(page.querySelector('h2')?.textContent).toContain('KYC-1');
    expect(page.querySelector('dl')?.textContent).toContain('PS123');
  });

  it('approves a submission and announces the result', () => {
    button('Approve').click();
    fixture.detectChanges();

    expect(kyc.reviewKyc).toHaveBeenCalledOnceWith('u-1', true, undefined);
    expect(page.querySelector('[role="status"]')?.textContent).toContain('KYC-1 approved');
  });

  it('rejects with the typed reason', () => {
    const reason = page.querySelector<HTMLTextAreaElement>('#reason-KYC-1')!;
    reason.value = 'Document expired';
    reason.dispatchEvent(new Event('input'));
    button('Reject').click();

    expect(kyc.reviewKyc).toHaveBeenCalledOnceWith('u-1', false, 'Document expired');
  });
});
