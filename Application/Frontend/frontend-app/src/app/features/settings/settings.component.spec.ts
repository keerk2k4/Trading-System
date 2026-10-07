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

  const inApp = () => el<HTMLInputElement>('[data-testid="settings-channel-PUSH"]');
  const email = () => el<HTMLInputElement>('[data-testid="settings-channel-EMAIL"]');

  async function toggleEmail(): Promise<void> {
    email().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function save(): Promise<void> {
    el('form').dispatchEvent(new Event('submit'));
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
    expect(email().checked).toBe(false);
  });

  it('shows in-app alerts as the default, always on and not selectable', async () => {
    await create();

    expect(inApp().checked).toBe(true);
    expect(inApp().disabled).toBe(true);
    expect(el('label[for="alert-in-app"]').textContent).toContain('(default, always on)');
    expect(page.querySelector('[data-testid="settings-channel-SMS"]')).toBeNull();
  });

  it('ticks email for a stored EMAIL preference, with in-app still on', async () => {
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'EMAIL' }));
    await create();

    expect(email().checked).toBe(true);
    expect(inApp().checked).toBe(true);
  });

  it('describes what is chosen, and changes when email is ticked', async () => {
    await create();
    expect(text('settings-channel-hint')).toContain('Nothing is emailed');

    await toggleEmail();

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

  it('reads a stored channel that is no longer offered (SMS) as email off, and saves in-app only', async () => {
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'SMS' }));
    tradeApi.updatePreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'PUSH' }));
    await create();

    expect(email().checked).toBe(false);
    await save();

    expect(tradeApi.updatePreferences).toHaveBeenCalledWith(jasmine.objectContaining({ alertChannel: 'PUSH' }));
  });

  it('saves email as EMAIL (in app and email) and confirms', async () => {
    await create();

    await toggleEmail();
    await save();

    expect(tradeApi.updatePreferences).toHaveBeenCalledWith(
      jasmine.objectContaining({ defaultAccountId: 6, alertChannel: 'EMAIL' })
    );
    expect(text('settings-success')).toContain('Preferences saved.');
    expect(email().checked).toBe(true);
  });

  it('turns email off again by saving PUSH (in app only)', async () => {
    tradeApi.getPreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'EMAIL' }));
    tradeApi.updatePreferences.and.returnValue(of({ accountId: 6, defaultAccountId: 6, alertChannel: 'PUSH' }));
    await create();

    await toggleEmail();
    await save();

    expect(tradeApi.updatePreferences).toHaveBeenCalledWith(jasmine.objectContaining({ alertChannel: 'PUSH' }));
    expect(email().checked).toBe(false);
    expect(inApp().checked).toBe(true);
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
