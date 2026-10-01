import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { MockKycService } from '../../shared/services/mock-kyc.service';
import { KycSubmission } from '../../shared/models/kyc.models';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let page: HTMLElement;

  function create(pending: KycSubmission[]): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MockAuthService, useValue: { currentUser$: signal({ username: 'ops', roles: ['ADMIN'] }) } },
        { provide: MockKycService, useValue: { getPendingKycSubmissions: () => of(pending) } }
      ]
    });
    fixture = TestBed.createComponent(AdminDashboardComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('counts and previews the pending KYC submissions', () => {
    create([
      { id: 'KYC-1', userId: 'u-1', dateOfBirth: '', documentType: 'PASSPORT', documentNumber: 'X', status: 'PENDING' },
      { id: 'KYC-2', userId: 'u-2', dateOfBirth: '', documentType: 'PAN', documentNumber: 'Y', status: 'PENDING' }
    ]);

    expect(page.querySelector('.tp-stat-value')?.textContent?.trim()).toBe('2');
    expect(page.querySelectorAll('tbody tr').length).toBe(2);
    expect(page.querySelector('a[href="/admin/kyc-review"]')).not.toBeNull();
  });

  it('says when the queue is empty', () => {
    create([]);

    expect(page.querySelector('.tp-empty')?.textContent).toContain('All caught up');
  });
});
