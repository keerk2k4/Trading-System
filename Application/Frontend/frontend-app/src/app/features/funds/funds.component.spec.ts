import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { FundsComponent } from './funds.component';
import { MockAuthService } from '../../shared/services/mock-auth.service';
import { TradeApiService } from '../../shared/services/trade-api.service';

describe('FundsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<FundsComponent>;
  let page: HTMLElement;

  function create(): void {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getBalance', 'updateBalance']);
    tradeApi.getBalance.and.returnValue(
      of({ accountId: 6, cashBalance: 1000, currency: 'USD', asOf: '2026-10-01T00:00:00Z' })
    );
    tradeApi.updateBalance.and.callFake((body: { cashBalance: number }) =>
      of({ accountId: 6, cashBalance: body.cashBalance, currency: 'USD', asOf: '2026-10-01T00:10:00Z' })
    );

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        {
          provide: MockAuthService,
          useValue: { currentUser$: signal({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] }) }
        }
      ]
    });

    fixture = TestBed.createComponent(FundsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  function setAmount(value: string): void {
    const input = page.querySelector<HTMLInputElement>('#amount')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('loads and shows current account balance', () => {
    create();

    expect(tradeApi.getBalance).toHaveBeenCalledOnceWith();
    expect(page.textContent).toContain('$1,000.00');
  });

  it('deposits entered amount into the trading account balance', () => {
    create();
    setAmount('250.25');

    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(tradeApi.updateBalance).toHaveBeenCalledOnceWith({ cashBalance: 1250.25 });
    expect(page.textContent).toContain('Funds deposited successfully.');
    expect(page.textContent).toContain('$1,250.25');
  });

  it('withdraws entered amount from the trading account balance', () => {
    create();
    setAmount('100');

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Withdraw'))!.click();
    fixture.detectChanges();

    expect(tradeApi.updateBalance).toHaveBeenCalledOnceWith({ cashBalance: 900 });
    expect(page.textContent).toContain('Funds withdrawn successfully.');
    expect(page.textContent).toContain('$900.00');
  });

  it('blocks withdrawal when amount exceeds available balance', () => {
    create();
    setAmount('1001');

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Withdraw'))!.click();
    fixture.detectChanges();

    expect(tradeApi.updateBalance).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Withdrawal amount exceeds your available cash balance.');
  });

  it('requires an amount before attempting a transfer', () => {
    create();

    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(tradeApi.updateBalance).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Enter an amount.');
  });
});
