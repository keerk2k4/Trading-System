import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { TradeApiService } from '../../shared/services/trade-api.service';
import { MockAuthService } from '../../shared/services/auth.service';

describe('SettingsComponent', () => {
  let tradeApi: jasmine.SpyObj<TradeApiService>;
  let auth: jasmine.SpyObj<MockAuthService>;
  let fixture: ComponentFixture<SettingsComponent>;
  let page: HTMLElement;

  const el = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const text = (testId: string) => el(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TradeApiService, useValue: tradeApi },
        { provide: MockAuthService, useValue: auth }
      ]
    });
    fixture = TestBed.createComponent(SettingsComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function choose(channel: string): Promise<void> {
    el<HTMLInputElement>(`[data-testid="settings-channel-${channel}"]`).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    tradeApi = jasmine.createSpyObj<TradeApiService>('TradeApiService', ['getAccount', 'getPreferences', 'updatePreferences']);
    tradeApi.getAccount.and.returnValue(
      of({ id: 6, accountId: 'ACC-6', holderName: 'Gaurang', cashBalance: 1000, status: 'ACTIVE', version: 1, lastUpdated: '' })
    );
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'PUSH' }));
    tradeApi.updatePreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'EMAIL' }));
    auth = jasmine.createSpyObj<MockAuthService>('MockAuthService', ['getContact']);
    auth.getContact.and.returnValue(of({ email: 'gaurang@example.com', phone: '+919876543210' }));
  });

  it('loads the account and the stored preferences into the form', async () => {
    await create();

    expect(el<HTMLSelectElement>('[data-testid="settings-default-account"]').selectedOptions[0].textContent).toContain('ACC-6');
    expect(el<HTMLInputElement>('[data-testid="settings-channel-PUSH"]').checked).toBe(true);
  });

  it('offers only "In app only" and "In app and email"', async () => {
    await create();

    const labels = Array.from(page.querySelectorAll('.tp-segmented label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['In app only', 'In app and email']);
    expect(page.querySelector('[data-testid="settings-channel-SMS"]')).toBeNull();
  });

  it('describes the option that is chosen, and changes when another is picked', async () => {
    await create();
    expect(text('settings-channel-hint')).toContain('Nothing is emailed');

    await choose('EMAIL');

    expect(text('settings-channel-hint')).toContain('also emailed to gaurang@example.com');
  });

  it('shows the email and phone alerts go to', async () => {
    await create();

    expect(text('settings-email')).toBe('gaurang@example.com');
    expect(text('settings-phone')).toBe('+919876543210');
  });

  it('says when no phone was given, and when contact details cannot be loaded', async () => {
    auth.getContact.and.returnValue(of({ email: 'gaurang@example.com', phone: null }));
    await create();
    expect(text('settings-phone')).toBe('Not provided');

    TestBed.resetTestingModule();
    auth.getContact.and.returnValue(throwError(() => ({ status: 503 })));
    await create();
    expect(text('settings-contact-error')).toContain("couldn't be loaded");
  });

  it('leaves the choice open for a stored channel that is no longer offered, and asks for one', async () => {
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'SMS' }));
    await create();

    expect(page.querySelectorAll('.tp-segmented input:checked').length).toBe(0);
    el('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(text('settings-error')).toBe('Choose how you want to be alerted.');
    expect(tradeApi.updatePreferences).not.toHaveBeenCalled();
  });

  it('saves the chosen channel and confirms', async () => {
    await create();

    await choose('EMAIL');
    el('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(tradeApi.updatePreferences).toHaveBeenCalledWith(
      jasmine.objectContaining({ defaultAccountId: 6, alertChannel: 'EMAIL' })
    );
    expect(text('settings-success')).toContain('Preferences saved.');
  });

  it('shows a mapped error when saving fails', async () => {
    tradeApi.updatePreferences.and.returnValue(throwError(() => ({ errorCode: 'ORD-409', message: '', status: 409 })));
    await create();

    el('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el('[role="alert"]')?.textContent).toBeTruthy();
  });
});
