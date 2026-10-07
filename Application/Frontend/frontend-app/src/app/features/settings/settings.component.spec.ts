import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { TradeApiService } from '../../shared/services/trade-api.service';

describe('SettingsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let fixture: ComponentFixture<SettingsComponent>;
  let page: HTMLElement;

  const el = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TradeApiService, useValue: tradeApi }]
    });
    fixture = TestBed.createComponent(SettingsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getPreferences', 'updatePreferences']);
    tradeApi.getAccount.and.returnValue(
      of({ id: 6, accountId: 'ACC-6', holderName: 'Gaurang', cashBalance: 1000, status: 'ACTIVE', version: 1, lastUpdated: '' })
    );
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'SMS' }));
    tradeApi.updatePreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'EMAIL' }));
  });

  it('loads the account and the stored preferences into the form', async () => {
    create();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el<HTMLSelectElement>('[data-testid="settings-default-account"]').selectedOptions[0].textContent).toContain('ACC-6');
    expect(el<HTMLInputElement>('[data-testid="settings-channel-SMS"]').checked).toBe(true);
  });

  it('saves the chosen channel and confirms', async () => {
    create();
    await fixture.whenStable();

    el<HTMLInputElement>('[data-testid="settings-channel-EMAIL"]').click();
    el('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tradeApi.updatePreferences).toHaveBeenCalledWith(
      jasmine.objectContaining({ defaultAccountId: 6, alertChannel: 'EMAIL' })
    );
    expect(el('[data-testid="settings-success"]')?.textContent).toContain('Preferences saved.');
  });

  it('shows a mapped error when saving fails', async () => {
    tradeApi.updatePreferences.and.returnValue(throwError(() => ({ errorCode: 'ORD-409', message: '', status: 409 })));
    create();
    await fixture.whenStable();

    el('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el('[role="alert"]')?.textContent).toBeTruthy();
  });
});
