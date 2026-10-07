import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { MockAuthService } from '../../shared/services/auth.service';
import { MockKycService } from '../../shared/services/kyc.service';
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
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getBalance', 'getPositions', 'getHoldings']);
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
    tradeApi.getHoldings.and.returnValue(of([]));
  });

  it('tells a suspended customer that orders will be refused', () => {
    tradeApi.getAccount.and.returnValue(
      of({ id: 6, accountId: 'ACC-6', holderName: 'Gaurang', cashBalance: 1000, status: 'SUSPENDED', version: 1, lastUpdated: '' })
    );
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    expect(page.querySelector('[data-testid="account-suspended-notice"]')?.textContent).toContain(
      'Your account is suspended.'
    );
  });

  it('shows no suspended notice for an active account', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    expect(page.querySelector('[data-testid="account-suspended-notice"]')).toBeNull();
  });

  it('summarises cash, holdings at cost and the total', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    expect(page.querySelector('h1')?.textContent).toContain('gaurang123');
    expect(statValues()).toEqual(['$3,300.00', '$1,000.00', '$2,300.00', '$0.00', '0.00%']);
  });

  it('totals unrealized P&L across positions as an amount and a share of cost basis', () => {
    tradeApi.getPositions.and.returnValue(
      of([
        // Cost 2,500 -> 2,700: +200
        { accountId: 6, symbol: 'ACME', quantity: 100, averageCost: 25, currentPrice: 27, marketValue: 2700, unrealizedPnl: 200, unrealizedPnlPercent: 8 },
        // Cost 1,000 -> 900: -100
        { accountId: 6, symbol: 'BETA', quantity: 10, averageCost: 100, currentPrice: 90, marketValue: 900, unrealizedPnl: -100, unrealizedPnlPercent: -10 }
      ])
    );
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const pnl = page.querySelector('[data-testid="dashboard-unrealized-pnl"] app-pnl-value')!;
    const pnlPercent = page.querySelector('[data-testid="dashboard-unrealized-pnl-percent"] app-pnl-value')!;
    expect(pnl.textContent?.trim()).toBe('+$100.00');
    // 100 / 3,500 cost basis
    expect(pnlPercent.textContent?.trim()).toBe('+2.86%');
    expect(pnl.classList).toContain('tp-positive');
  });

  it('shows each position\'s unrealized P&L and a total row in the positions table', () => {
    tradeApi.getPositions.and.returnValue(
      of([
        { accountId: 6, symbol: 'ACME', quantity: 100, averageCost: 25, currentPrice: 27, marketValue: 2700, unrealizedPnl: 200, unrealizedPnlPercent: 8 },
        { accountId: 6, symbol: 'BETA', quantity: 10, averageCost: 100, currentPrice: 90, marketValue: 900, unrealizedPnl: -100, unrealizedPnlPercent: -10 },
        // No quote yet: valued at cost, P&L not available
        { accountId: 6, symbol: 'GAMA', quantity: 4, averageCost: 50, currentPrice: null, marketValue: null, unrealizedPnl: null, unrealizedPnlPercent: null }
      ])
    );
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const cell = (symbol: string, id: string) =>
      page.querySelector(`[data-symbol="${symbol}"] [data-testid="${id}"] app-pnl-value`)!;
    expect(cell('ACME', 'position-unrealized-pnl').textContent?.trim()).toBe('+$200.00');
    expect(cell('ACME', 'position-unrealized-pnl-percent').textContent?.trim()).toBe('+8.00%');
    expect(cell('ACME', 'position-unrealized-pnl').classList).toContain('tp-positive');
    expect(cell('BETA', 'position-unrealized-pnl').textContent?.trim()).toBe('-$100.00');
    expect(cell('BETA', 'position-unrealized-pnl-percent').classList).toContain('tp-negative');
    expect(cell('GAMA', 'position-unrealized-pnl').textContent?.trim()).toBe('—');

    const total = page.querySelector('[data-testid="positions-total-row"]')!;
    // Market value 2,700 + 900 + 200 at cost
    expect(total.textContent).toContain('$3,800.00');
    expect(total.querySelector('[data-testid="positions-total-pnl"] app-pnl-value')?.textContent?.trim()).toBe('+$100.00');
    // 100 / (2,500 + 1,000 + 200) cost basis
    expect(total.querySelector('[data-testid="positions-total-pnl-percent"] app-pnl-value')?.textContent?.trim()).toBe('+2.70%');
  });

  it('shows settled holdings beside positions and counts them towards the total', () => {
    tradeApi.getPositions.and.returnValue(of([]));
    tradeApi.getHoldings.and.returnValue(
      of([
        { accountId: 6, symbol: 'ACME', quantity: 100, averageCost: 25, currentPrice: 27, marketValue: 2700, unrealizedPnl: 200, unrealizedPnlPercent: 8 }
      ])
    );
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    const rows = page.querySelectorAll('[data-testid="holding-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('ACME');
    // Cash 1,000 + holdings 2,700 at live price.
    expect(statValues()).toEqual(['$3,700.00', '$1,000.00', '$2,700.00', '+$200.00', '+8.00%']);
    expect(page.querySelector('[data-testid="dashboard-holding-count"]')?.textContent).toContain('1 settled holding');
    const total = page.querySelector('[data-testid="holdings-total-row"]')!;
    expect(total.textContent).toContain('$2,700.00');
  });

  it('explains a missing trading account when the backend returns ACC-404', () => {    tradeApi.getAccount.and.returnValue(throwError(() => ({ errorCode: 'ACC-404', message: '', status: 404 })));
    create({ id: 'u-1', username: 'gaurang123', accountId: 0, roles: ['CUSTOMER'] });

    expect(tradeApi.getAccount).toHaveBeenCalled();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('could not be found');
    expect(statValues()).toEqual(['—', '—', '—', '—', '—']);
  });
});
