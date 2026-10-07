import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AdminService as AuthAdminApi, AdminUserResponse } from '../../../generated/auth-admin-client';
import { AdminAccountDetail, AdminAccountSummary, AdminService as TradeAdminApi } from '../../../generated/trade-admin-client';
import { AdminCustomerService } from './admin-customer.service';

describe('AdminCustomerService', () => {
  let authAdmin: jasmine.SpyObj<AuthAdminApi>;
  let tradeAdmin: jasmine.SpyObj<TradeAdminApi>;
  let service: AdminCustomerService;

  const alice: AdminUserResponse = {
    userId: 'u-alice', username: 'alice', firstName: 'Alice', lastName: 'Trader',
    email: 'a***@example.com', phone: null, kycStatus: 'APPROVED'
  };
  const bob: AdminUserResponse = { ...alice, userId: 'u-bob', username: 'bob', firstName: 'Bob' };
  const account = (userId: string, id: number, status: AdminAccountSummary['status'] = 'ACTIVE'): AdminAccountSummary => ({
    id, accountNumber: `ACC-${id}`, userId, status, cashBalance: 100,
    createdAt: '2026-09-01T09:00:00', updatedAt: '2026-09-01T09:00:00'
  });
  const detail: AdminAccountDetail = {
    account: account('u-alice', 6), openPositions: 1, ordersByStatus: { FILLED: 2 },
    lastOrderAt: null, allowedNextStatuses: ['SUSPENDED', 'BLOCKED', 'CLOSED'], statusHistory: []
  };

  beforeEach(() => {
    authAdmin = jasmine.createSpyObj<AuthAdminApi>('AuthAdminApi', ['findUsers']);
    tradeAdmin = jasmine.createSpyObj<TradeAdminApi>('TradeAdminApi', ['searchAccounts', 'getAdminAccount', 'changeAccountStatus']);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthAdminApi, useValue: authAdmin },
        { provide: TradeAdminApi, useValue: tradeAdmin }
      ]
    });
    service = TestBed.inject(AdminCustomerService);
  });

  it('searches by name in the Auth service, then fetches those customers’ accounts', async () => {
    authAdmin.findUsers.and.returnValue(of([alice, bob]) as never);
    tradeAdmin.searchAccounts.and.returnValue(of([account('u-alice', 6)]) as never);

    const rows = await firstValueFrom(service.search({ query: ' ali ' }));

    expect(authAdmin.findUsers).toHaveBeenCalledWith('ali');
    expect(tradeAdmin.searchAccounts).toHaveBeenCalledWith(undefined, undefined, ['u-alice', 'u-bob']);
    expect(rows.map((r) => [r.profile?.username, r.account?.accountNumber ?? null])).toEqual([
      ['alice', 'ACC-6'],
      ['bob', null]
    ]);
  });

  it('drops name matches whose account does not match the status filter', async () => {
    authAdmin.findUsers.and.returnValue(of([alice, bob]) as never);
    tradeAdmin.searchAccounts.and.returnValue(of([account('u-bob', 7, 'SUSPENDED')]) as never);

    const rows = await firstValueFrom(service.search({ query: 'trader', status: 'SUSPENDED' }));

    expect(rows.map((r) => r.userId)).toEqual(['u-bob']);
  });

  it('asks the Trade API nothing when no customer matches the name', async () => {
    authAdmin.findUsers.and.returnValue(of([]) as never);

    expect(await firstValueFrom(service.search({ query: 'nobody' }))).toEqual([]);
    expect(tradeAdmin.searchAccounts).not.toHaveBeenCalled();
  });

  it('filters accounts in the Trade API, then names them from the Auth service', async () => {
    tradeAdmin.searchAccounts.and.returnValue(of([account('u-alice', 6, 'BLOCKED'), account('u-bob', 7, 'BLOCKED')]) as never);
    authAdmin.findUsers.and.returnValue(of([bob, alice]) as never);

    const rows = await firstValueFrom(service.search({ status: 'BLOCKED', accountNumber: ' ' }));

    expect(tradeAdmin.searchAccounts).toHaveBeenCalledWith('BLOCKED', undefined);
    expect(authAdmin.findUsers).toHaveBeenCalledWith(undefined, 'u-alice,u-bob');
    expect(rows.map((r) => [r.account?.id, r.profile?.username])).toEqual([
      [6, 'alice'],
      [7, 'bob']
    ]);
  });

  it('still lists accounts, without names, when the Auth service cannot answer', async () => {
    tradeAdmin.searchAccounts.and.returnValue(of([account('u-alice', 6)]) as never);
    authAdmin.findUsers.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    const rows = await firstValueFrom(service.search({}));

    expect(rows).toEqual([{ userId: 'u-alice', profile: null, account: account('u-alice', 6) }]);
  });

  it('loads an account with its customer', async () => {
    tradeAdmin.getAdminAccount.and.returnValue(of(detail) as never);
    authAdmin.findUsers.and.returnValue(of([alice]) as never);

    const view = await firstValueFrom(service.detail(6));

    expect(view).toEqual({ detail, profile: alice });
    expect(authAdmin.findUsers).toHaveBeenCalledWith(undefined, 'u-alice');
  });

  it('sends a status change with the reason trimmed', async () => {
    tradeAdmin.changeAccountStatus.and.returnValue(of(detail) as never);
    authAdmin.findUsers.and.returnValue(of([alice]) as never);

    await firstValueFrom(service.changeStatus(6, 'SUSPENDED', '  Chargeback  '));

    expect(tradeAdmin.changeAccountStatus).toHaveBeenCalledWith(6, { status: 'SUSPENDED', reason: 'Chargeback' });
  });
});
