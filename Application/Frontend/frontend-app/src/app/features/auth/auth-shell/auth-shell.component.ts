import { Component, ElementRef, input, viewChild } from '@angular/core';
import { AuthShowcaseComponent } from './auth-showcase.component';

/**
 * Shared frame for the sign-in and registration screens. On wide screens the
 * form column sits beside an inset product panel; below that the panel is
 * dropped and the form becomes a single card. Purely presentational - it
 * knows nothing about authentication.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [AuthShowcaseComponent],
  template: `
    <div class="auth-page">
      <main class="auth-main">
        <div class="auth-brand">
          <svg class="auth-logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="8" />
            <path d="M8 21l5.5-6 4 3.5L24 11" />
            <path d="M19.5 11H24v4.5" />
          </svg>
          <span>Trading Platform</span>
        </div>

        <section class="auth-card" aria-labelledby="auth-heading">
          <div class="auth-header">
            <h1 #headingEl id="auth-heading" class="auth-title" tabindex="-1">{{ heading() }}</h1>
            @if (subtitle(); as text) {
              <p class="auth-subtitle">{{ text }}</p>
            }
          </div>
          <ng-content />
        </section>
      </main>

      <aside class="auth-aside" aria-label="About Trading Platform">
        <app-auth-showcase />
      </aside>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .auth-page {
      min-height: 100vh;
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      color: var(--tp-text);
      color-scheme: var(--tp-color-scheme);
      background:
        radial-gradient(40rem 20rem at 50% -8rem, var(--tp-glow), transparent 70%),
        var(--tp-bg);
    }

    .auth-main {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.5rem 1rem 2rem;
    }

    .auth-brand,
    .auth-card {
      width: 100%;
      max-width: 26rem;
      margin: 0 auto;
    }

    .auth-brand {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 1.0625rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .auth-logo {
      width: 2rem;
      height: 2rem;
    }

    .auth-logo rect {
      fill: var(--tp-accent);
    }

    .auth-logo path {
      fill: none;
      stroke: var(--tp-on-accent);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .auth-card {
      padding: 1.5rem 1.25rem;
      background-color: var(--tp-surface);
      border: 1px solid var(--tp-border);
      border-radius: var(--tp-radius-lg);
      box-shadow: var(--tp-shadow);
    }

    .auth-header {
      margin-bottom: 1.5rem;
    }

    .auth-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }

    .auth-title:focus-visible {
      outline: 2px solid var(--tp-focus);
      outline-offset: 4px;
      border-radius: 0.25rem;
    }

    .auth-subtitle {
      margin: 0.5rem 0 0;
      font-size: 0.9375rem;
      line-height: 1.5;
      color: var(--tp-text-muted);
    }

    .auth-aside {
      display: none;
    }

    @media (min-width: 40rem) {
      .auth-card {
        margin-block: auto;
        padding: 2rem;
      }
    }

    @media (min-width: 60rem) {
      .auth-page {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
        background: var(--tp-surface);
      }

      .auth-main {
        padding: 2rem 3rem;
      }

      .auth-brand {
        max-width: none;
      }

      .auth-card {
        max-width: 23rem;
        margin: auto;
        padding: 0;
        background: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .auth-title {
        font-size: 1.875rem;
      }

      .auth-aside {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 1rem;
        padding: 3rem;
        border: 1px solid var(--tp-border);
        border-radius: var(--tp-radius-lg);
        background:
          radial-gradient(36rem 24rem at 80% 0%, var(--tp-glow), transparent 70%),
          var(--tp-bg);
      }
    }
  `]
})
export class AuthShellComponent {
  readonly heading = input.required<string>();
  readonly subtitle = input('');

  private readonly headingEl = viewChild.required<ElementRef<HTMLElement>>('headingEl');

  /** Moves focus to the page heading after the card's content is replaced. */
  focusHeading(): void {
    this.headingEl().nativeElement.focus();
  }
}
