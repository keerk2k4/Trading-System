import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { AdminService as AuthAdminApi } from '../../../generated/auth-admin-client';
import { AdminService as TradeAdminApi } from '../../../generated/trade-admin-client';
import {
  CustomerAccount,
  CustomerAccountDetail,
  CustomerAccountStatus,
  CustomerDetailView,
  CustomerProfile,
  CustomerRow,
  CustomerSearch
} from '../models/admin-customer.models';

/**
 * Admin customer lookup and account status changes, over the two generated
 * admin clients.
 *
 * A name search starts in the Auth service (names live there) and then asks
 * the Trade API for those customers' accounts. A status or account-number
 * filter starts in the Trade API and then asks the Auth service who the
 * accounts belong to. Either way the browser does the joining, so neither
 * service calls the other.
 */
@Injectable({
  providedIn: 'root'
})
export class AdminCustomerService {
  private readonly authAdmin = inject(AuthAdminApi);
  private readonly tradeAdmin = inject(TradeAdminApi);

  search(filters: CustomerSearch): Observable<CustomerRow[]> {
    const query = filters.query?.trim() ?? '';
    const status = filters.status ?? undefined;
    const accountNumber = filters.accountNumber?.trim() || undefined;
    return query ? this.byName(query, status, accountNumber) : this.byAccount(status, accountNumber);
  }

  detail(accountId: number): Observable<CustomerDetailView> {
    return this.tradeAdmin.getAdminAccount(accountId).pipe(switchMap((detail) => this.withProfile(detail)));
  }

  changeStatus(accountId: number, status: CustomerAccountStatus, reason: string): Observable<CustomerDetailView> {
    return this.tradeAdmin
      .changeAccountStatus(accountId, { status, reason: reason.trim() })
      .pipe(switchMap((detail) => this.withProfile(detail)));
  }

  private byName(
    query: string,
    status: CustomerAccountStatus | undefined,
    accountNumber: string | undefined
  ): Observable<CustomerRow[]> {
    return this.authAdmin.findUsers(query).pipe(
      switchMap((profiles) => {
        if (profiles.length === 0) {
          return of([]);
        }
        const ids = profiles.map((profile) => profile.userId);
        return this.tradeAdmin.searchAccounts(status, accountNumber, ids).pipe(
          map((accounts) => {
            const byUser = new Map(accounts.map((account) => [account.userId, account]));
            const filtered = status !== undefined || accountNumber !== undefined;
            return profiles
              .map((profile) => ({ userId: profile.userId, profile, account: byUser.get(profile.userId) ?? null }))
              // With an account filter, a customer whose account does not match is not a match.
              .filter((row) => !filtered || row.account !== null);
          })
        );
      })
    );
  }

  private byAccount(status: CustomerAccountStatus | undefined, accountNumber: string | undefined): Observable<CustomerRow[]> {
    return this.tradeAdmin.searchAccounts(status, accountNumber).pipe(
      switchMap((accounts) => {
        if (accounts.length === 0) {
          return of([]);
        }
        const ids = [...new Set(accounts.map((account) => account.userId))].join(',');
        return this.profilesOrNone(ids).pipe(map((profiles) => this.rowsFor(accounts, profiles)));
      })
    );
  }

  private rowsFor(accounts: CustomerAccount[], profiles: CustomerProfile[]): CustomerRow[] {
    const byUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    return accounts.map((account) => ({
      userId: account.userId,
      profile: byUser.get(account.userId) ?? null,
      account
    }));
  }

  private withProfile(detail: CustomerAccountDetail): Observable<CustomerDetailView> {
    return this.profilesOrNone(detail.account.userId).pipe(
      map((profiles) => ({ detail, profile: profiles[0] ?? null }))
    );
  }

  // Names are a nicety on the account screens: if the Auth service cannot
  // answer, the accounts are still shown, without names.
  private profilesOrNone(ids: string): Observable<CustomerProfile[]> {
    return this.authAdmin.findUsers(undefined, ids).pipe(catchError(() => of([] as CustomerProfile[])));
  }
}
