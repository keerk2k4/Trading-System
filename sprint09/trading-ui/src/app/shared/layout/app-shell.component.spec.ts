import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppShellComponent } from './app-shell.component';
import { MockAuthService } from '../services/mock-auth.service';
import { User } from '../models/auth.models';

describe('AppShellComponent', () => {
  let user: ReturnType<typeof signal<User | null>>;
  let auth: { currentUser$: typeof user; logout: jasmine.Spy };
  let fixture: ComponentFixture<AppShellComponent>;
  let page: HTMLElement;

  const navLabels = () =>
    Array.from(page.querySelectorAll('nav[aria-label="Main"] a')).map((a) => a.textContent?.trim());

  function create(current: User): void {
    user = signal<User | null>(current);
    auth = { currentUser$: user, logout: jasmine.createSpy('logout') };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MockAuthService, useValue: auth }]
    });
    fixture = TestBed.createComponent(AppShellComponent);
    page = fixture.nativeElement;
    fixture.detectChanges();
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('tp_theme');
  });

  it('shows the trading navigation and account for a customer', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    expect(navLabels()).toEqual(['Dashboard', 'Funds', 'Place order', 'Orders', 'Verification']);
    expect(page.querySelector('.sh-name')?.textContent).toContain('gaurang123');
    expect(page.querySelector('.sh-role')?.textContent).toContain('Account 6');
  });

  it('shows the admin navigation for an administrator', () => {
    create({ id: 'a-1', username: 'ops', accountId: 0, roles: ['ADMIN'] });

    expect(navLabels()).toEqual(['Overview', 'KYC review']);
    expect(page.querySelector('.sh-role')?.textContent).toContain('Administrator');
  });

  it('signs out through the auth service and returns to the login page', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.includes('Sign out'))!.click();

    expect(auth.logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('switches and remembers the colour theme', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });
    const toggle = page.querySelector<HTMLButtonElement>('.sh-icon-btn')!;
    const before = toggle.getAttribute('aria-label');

    toggle.click();
    fixture.detectChanges();

    const theme = document.documentElement.dataset['theme'];
    expect(theme === 'light' || theme === 'dark').toBe(true);
    expect(localStorage.getItem('tp_theme')).toBe(theme!);
    expect(toggle.getAttribute('aria-label')).not.toBe(before);
  });

  it('moves focus to the main region from the skip link', () => {
    create({ id: 'u-1', username: 'gaurang123', accountId: 6, roles: ['CUSTOMER'] });

    page.querySelector<HTMLButtonElement>('.sh-skip')!.click();

    expect(document.activeElement).toBe(page.querySelector('main'));
  });
});
