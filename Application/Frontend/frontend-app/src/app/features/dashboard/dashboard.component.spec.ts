import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { MockKycService } from '../../shared/services/mock-kyc.service';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { User } from '../../shared/models/auth.models';

describe('DashboardComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<DashboardComponent>;
  let page: HTMLElement;

  function create(user: User): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        { provide: MockAuthService, useValue: { currentUser$: signal(user) } },
        { provide: MockKycService, useValue: { getCurrentUserKycStatus: () => 'APPROVED' } }
      ]
    });
    fixture = TestBed.createComponent(DashboardComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  const statValues = () => Array.from(page.querySelectorAll('.tp-stat-value')).map((v) => v.textContent?.trim());

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getBalance', 'getPositions']);
    tradeApi.getAccount.and.returnValue(
      of({ id: 6, accountId: 'ACC-6', holderName: 'Gaurang', cashBalance: 1000, status: 'ACTIVE', version: 1, lastUpdated: '' })
    );
    tradeApi.getBalance.and.returnValue(of({ accountId: 6, cashBalance: 1000, currency: 'USD', asOf: '2026-10-01T09:00:00Z' }));
    tradeApi.getPositions.and.returnValue(
      of([
        { accountId: 6, symbol: 'AAPL', quantity: 10, averageCost: 150 },
        { accountId: 6, symbol: 'MSFT', quantity: 2, averageCost: 400 }
      ])
    );
  });

  it('summarises cash, holdings at cost and the total', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    expect(page.querySelector('h1')?.textContent).toContain('gaurang123');
    expect(statValues()).toEqual(['$3,300.00', '$1,000.00', '$2,300.00']);
  });

  it('lists each position with its cost basis', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const rows = Array.from(page.querySelectorAll('tbody tr')).map((r) => r.textContent);
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('AAPL');
    expect(rows[0]).toContain('$1,500.00');
    expect(page.textContent).toContain('2 open positions');
  });

  it('shows account details with statuses in words', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const details = page.querySelector('dl')?.textContent ?? '';
    expect(details).toContain('Gaurang');
    expect(details).toContain('Active');
    expect(details).toContain('Approved');
  });

  it('explains a missing trading account when the backend returns ACC-404', () => {
    tradeApi.getAccount.and.returnValue(throwError(() => ({ errorCode: 'ACC-404', message: '', status: 404 })));
    create({ id: 'u-1', username: 'gaurang123', accountId: 0, roles: ['CUSTOMER'] });

    expect(tradeApi.getAccount).toHaveBeenCalled();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('could not be found');
    expect(statValues()).toEqual(['—', '—', '—']);
  });
});
