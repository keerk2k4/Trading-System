import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MockAuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';

interface NavItem {
  label: string;
  link: string;
  icon: string;
}

const CUSTOMER_NAV: NavItem[] = [
  { label: 'Dashboard', link: '/dashboard', icon: 'var(--tp-icon-grid)' },
  { label: 'Watchlist', link: '/watchlist', icon: 'var(--tp-icon-eye)' },
  { label: 'Funds', link: '/funds', icon: 'var(--tp-icon-wallet)' },
  { label: 'Place order', link: '/orders/new', icon: 'var(--tp-icon-order)' },
  { label: 'Orders', link: '/orders/history', icon: 'var(--tp-icon-list)' },
  { label: 'Verification', link: '/kyc-submission', icon: 'var(--tp-icon-shield)' }
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Overview', link: '/admin/dashboard', icon: 'var(--tp-icon-grid)' },
  { label: 'KYC review', link: '/admin/kyc-review', icon: 'var(--tp-icon-shield)' }
];

/**
 * Frame for every signed-in screen: sidebar navigation (a scrolling tab row
 * on narrow screens), a top bar with the account, theme and sign-out, and
 * the routed page. Styles live in styles.css under "App shell" (`sh-`).
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <button type="button" class="sh-skip" (click)="focusMain()">Skip to main content</button>

    <div class="sh">
      <aside class="sh-sidebar">
        <a class="sh-brand" [routerLink]="navItems()[0].link">
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="7" />
            <path d="M8 21l5.5-6 4 3.5L24 11M19.5 11H24v4.5" />
          </svg>
          Trading Platform
        </a>
        <nav aria-label="Main">
          <ul class="sh-nav">
            @for (item of navItems(); track item.link) {
              <li>
                <a
                  class="sh-nav-link"
                  [routerLink]="item.link"
                  [attr.data-testid]="'nav' + item.link.split('/').join('-')"
                  routerLinkActive="is-active"
                  ariaCurrentWhenActive="page"
                  [style.--icon]="item.icon"
                  >{{ item.label }}</a
                >
              </li>
            }
          </ul>
        </nav>
      </aside>

      <div class="sh-workspace">
        <header class="sh-topbar">
          <div class="sh-account">
            <span class="sh-avatar" aria-hidden="true">{{ initial() }}</span>
            <span class="sh-who">
              <span class="sh-name" data-testid="shell-username">{{ username() }}</span>
              <span class="sh-role" data-testid="shell-role">{{ roleLabel() }}</span>
            </span>
          </div>
          <div class="sh-tools">
            <button
              type="button"
              class="sh-icon-btn"
              [class.is-dark]="theme.theme() === 'dark'"
              [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
              (click)="theme.toggle()"
            ></button>
            @if (isAuthenticated()) {
              <button type="button" class="tp-btn tp-btn-secondary" data-testid="nav-sign-out" (click)="signOut()">
                Sign out
              </button>
            }
          </div>
        </header>

        <main #main id="main" class="sh-main" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `
})
export class AppShellComponent {
  private readonly authService = inject(MockAuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  private readonly user = this.authService.currentUser$;
  // Navigation/role label must follow the JWT `roles` claim (in-memory),
  // not the `current_user` localStorage cache, so editing localStorage
  // cannot reveal the admin navigation.
  private readonly isAdmin = computed(() => this.authService.isAdmin());

  // Reads the session signal, so the sign-out button disappears as soon as
  // the session is cleared.
  protected readonly isAuthenticated = computed(() => this.authService.isAuthenticated());

  protected readonly navItems =computed(() => (this.isAdmin() ? ADMIN_NAV : CUSTOMER_NAV));
  protected readonly username = computed(() => this.user()?.username ?? '');
  protected readonly initial = computed(() => this.username().charAt(0) || '?');
  protected readonly roleLabel = computed(() => {
    if (this.isAdmin()) {
      return 'Administrator';
    }
    return 'Customer';
  });

  protected focusMain(): void {
    this.main().nativeElement.focus();
  }

  protected signOut(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
