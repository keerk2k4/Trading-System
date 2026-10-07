import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { CustomerDetailComponent } from './customer-detail.component';
import { AdminCustomerService } from '../../../shared/services/admin-customer.service';
import { CustomerAccountStatus, CustomerDetailView } from '../../../shared/models/admin-customer.models';

describe('CustomerDetailComponent', () => {
  let customers: jasmine.SpyObj<AdminCustomerService>;
  let fixture: ComponentFixture<CustomerDetailComponent>;
  let page: HTMLElement;

  function view(status: CustomerAccountStatus, next: CustomerAccountStatus[], history = false): CustomerDetailView {
    return {
      profile: { userId: 'u-alice', username: 'alice', firstName: 'Alice', lastName: 'Trader', email: 'a***@example.com', phone: '******3210', kycStatus: 'APPROVED' },
      detail: {
        account: { id: 6, accountNumber: 'ACC-6', userId: 'u-alice', status, cashBalance: 1000, createdAt: '2026-09-01T09:00:00', updatedAt: '2026-09-01T09:00:00' },
        openPositions: 2,
        ordersByStatus: { FILLED: 5, REJECTED: 1 },
        lastOrderAt: '2026-10-06T14:30:00',
        allowedNextStatuses: next,
        statusHistory: history
          ? [{ fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason: 'Chargeback', changedBy: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', changedAt: '2026-10-07T09:00:00' }]
          : []
      }
    };
  }

  const el = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const text = (testId: string) => el(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  function choose(status: string): void {
    el<HTMLInputElement>(`[data-testid="change-to-${status}"] input`).click();
    fixture.detectChanges();
  }
  function reason(value: string): void {
    const box = el<HTMLTextAreaElement>('[data-testid="change-reason"]');
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  function submit(): void {
    el('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function create(initial: CustomerDetailView): void {
    customers.detail.and.returnValue(of(initial));
    fixture = TestBed.createComponent(CustomerDetailComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    customers = jasmine.createSpyObj<AdminCustomerService>('AdminCustomerService', ['detail', 'changeStatus']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminCustomerService, useValue: customers },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ accountId: '6' })) } }
      ]
    });
  });

  it('shows the customer, the account and its activity', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));

    expect(customers.detail).toHaveBeenCalledWith(6);
    expect(text('detail-name')).toBe('Alice Trader');
    expect(text('detail-status')).toBe('Active');
    expect(page.textContent).toContain('a***@example.com');
    expect(text('detail-positions')).toBe('2');
    expect(text('detail-orders')).toContain('5 filled');
    expect(text('detail-orders')).toContain('1 rejected');
  });

  it('offers only the statuses the account may move to, each with what it means', () => {
    create(view('SUSPENDED', ['ACTIVE', 'BLOCKED', 'CLOSED']));

    const offered = Array.from(page.querySelectorAll('[data-testid^="change-to-"]')).map((e) => e.getAttribute('data-testid'));
    expect(offered).toEqual(['change-to-ACTIVE', 'change-to-BLOCKED', 'change-to-CLOSED']);
    expect(text('change-to-BLOCKED')).toContain("can't sign in again");
    expect(text('change-to-BLOCKED')).toContain('Block');
  });

  it('shows the current status and what it allows, in words and not by colour alone', () => {
    create(view('SUSPENDED', ['ACTIVE', 'BLOCKED', 'CLOSED']));

    const current = text('change-current');
    expect(current).toContain('Suspended');
    expect(current).toContain('Can sign in');
    expect(current).toContain('Orders refused');
  });

  it('draws each choice as a card named for the action, with its sign-in and order facts', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));

    const suspended = el('[data-testid="change-to-SUSPENDED"]');
    expect(suspended.querySelector('[data-testid="change-title"]')?.textContent?.trim()).toBe('Suspend');
    expect(suspended.textContent).toContain('Can sign in');
    expect(suspended.textContent).toContain('Orders refused');
    const closed = el('[data-testid="change-to-CLOSED"]');
    expect(closed.classList).toContain('is-danger');
    expect(closed.textContent).toContain('Permanent');
    expect(el('[data-testid="change-to-BLOCKED"]').classList).not.toContain('is-danger');
  });

  it('names the action on the button, and says plainly when it is permanent', () => {
    create(view('SUSPENDED', ['ACTIVE', 'BLOCKED', 'CLOSED']));
    expect(text('change-submit')).toBe('Change status');

    choose('ACTIVE');
    expect(text('change-submit')).toBe('Reactivate account');
    choose('CLOSED');
    expect(text('change-submit')).toBe('Close account permanently');
  });

  it('requires a status and a reason before sending anything', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));

    submit();
    expect(page.textContent).toContain('Choose the new status.');
    choose('SUSPENDED');
    reason('   ');
    submit();

    expect(el('#change-reason-error').textContent).toContain('Give a reason');
    expect(customers.changeStatus).not.toHaveBeenCalled();
  });

  it('asks for confirmation before closing an account, which cannot be undone', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));
    customers.changeStatus.and.returnValue(of(view('CLOSED', [])));

    choose('CLOSED');
    reason('Customer asked to close');
    submit();
    expect(customers.changeStatus).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Confirm that you mean to close the account.');

    el<HTMLInputElement>('[data-testid="change-confirm-close"] input').click();
    fixture.detectChanges();
    submit();

    expect(customers.changeStatus).toHaveBeenCalledWith(6, 'CLOSED', 'Customer asked to close');
  });

  it('changes the status and shows the new state and its history', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));
    customers.changeStatus.and.returnValue(of(view('SUSPENDED', ['ACTIVE', 'BLOCKED', 'CLOSED'], true)));

    choose('SUSPENDED');
    reason('Chargeback');
    submit();

    expect(customers.changeStatus).toHaveBeenCalledWith(6, 'SUSPENDED', 'Chargeback');
    expect(text('change-success')).toBe('Account status changed to SUSPENDED.');
    expect(text('detail-status')).toBe('Suspended');
    const history = el('[data-testid="history-row"]');
    expect(history.textContent).toContain('Chargeback');
    expect(history.textContent).toContain('By admin aaaaaaaa');
  });

  it('explains a refused change and reloads the account to show where it stands', () => {
    create(view('ACTIVE', ['SUSPENDED', 'BLOCKED', 'CLOSED']));
    customers.changeStatus.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'ACC-409', message: '' } }))
    );
    customers.detail.and.returnValue(of(view('BLOCKED', ['ACTIVE', 'SUSPENDED', 'CLOSED'])));

    choose('SUSPENDED');
    reason('Chargeback');
    submit();

    expect(text('change-error')).toContain('may have just been changed by another admin');
    expect(customers.detail).toHaveBeenCalledTimes(2);
    expect(text('detail-status')).toBe('Blocked');
  });

  it('offers no change for a closed account', () => {
    create(view('CLOSED', []));

    expect(text('change-closed')).toContain('Closing is permanent');
    expect(page.querySelector('form')).toBeNull();
  });
});
