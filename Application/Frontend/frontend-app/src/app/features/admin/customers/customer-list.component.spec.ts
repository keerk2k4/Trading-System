import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CustomerListComponent } from './customer-list.component';
import { AdminCustomerService } from '../../../shared/services/admin-customer.service';
import { CustomerRow } from '../../../shared/models/admin-customer.models';

describe('CustomerListComponent', () => {
  let customers: jasmine.SpyObj<AdminCustomerService>;
  let fixture: ComponentFixture<CustomerListComponent>;
  let page: HTMLElement;

  const row: CustomerRow = {
    userId: 'u-alice',
    profile: { userId: 'u-alice', username: 'alice', firstName: 'Alice', lastName: 'Trader', email: null, phone: null, kycStatus: 'APPROVED' },
    account: { id: 6, accountNumber: 'ACC-6', userId: 'u-alice', status: 'SUSPENDED', cashBalance: 1000, createdAt: '2026-09-01T09:00:00', updatedAt: '2026-09-01T09:00:00' }
  };

  const el = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  function type(testId: string, value: string): void {
    const input = el<HTMLInputElement>(`[data-testid="${testId}"]`);
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  }
  function search(): void {
    el('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    customers = jasmine.createSpyObj<AdminCustomerService>('AdminCustomerService', ['search']);
    customers.search.and.returnValue(of([row]));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminCustomerService, useValue: customers }]
    });
    fixture = TestBed.createComponent(CustomerListComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('opens on the newest accounts, each linking to its detail page', () => {
    expect(customers.search).toHaveBeenCalledWith({ query: '', accountNumber: '', status: null });
    expect(el('h2#results-heading').textContent).toContain('Newest accounts');
    const rowEl = el('[data-testid="customer-row"]');
    expect(rowEl.textContent).toContain('Alice Trader');
    expect(rowEl.textContent).toContain('Suspended');
    expect(el<HTMLAnchorElement>('[data-testid="customer-open"]').getAttribute('href')).toBe('/admin/customers/6');
  });

  it('searches with every filter given', () => {
    type('customer-query', 'ali');
    type('customer-account-number', 'ACC-6');
    type('customer-status', 'SUSPENDED');
    search();

    expect(customers.search).toHaveBeenCalledWith({ query: 'ali', accountNumber: 'ACC-6', status: 'SUSPENDED' });
    expect(el('h2#results-heading').textContent).toContain('Results');
  });

  it('asks for two characters rather than searching on one', () => {
    customers.search.calls.reset();
    type('customer-query', 'a');
    search();

    expect(customers.search).not.toHaveBeenCalled();
    expect(el('#customer-query-error').textContent).toContain('at least 2 characters');
  });

  it('says so when nothing matches', () => {
    customers.search.and.returnValue(of([]));
    type('customer-query', 'nobody');
    search();

    expect(el('[data-testid="customer-empty"]').textContent).toContain('No customers found');
  });

  it('shows a refusal as a sentence an admin can act on', () => {
    customers.search.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { errorCode: 'AUTH-403', message: 'Forbidden' } }))
    );
    search();

    expect(el('[data-testid="customer-error"]').textContent).toContain('needs an admin sign-in');
  });
});
