import { Component } from '@angular/core';

/**
 * Product panel shown beside the sign-in and registration forms on wide
 * screens. The chart is an illustration of the product's visual language,
 * not data, so it carries no figures and is hidden from assistive technology.
 */
@Component({
  selector: 'app-auth-showcase',
  template: `
    <p class="headline">Every order, position and balance in one focused workspace.</p>
    <p class="lede">
      Place trades, follow each order through to its fill and keep your portfolio in view without
      leaving the screen.
    </p>

    <div class="chart-card" aria-hidden="true">
      <div class="chart-head">
        <span class="chart-title">Portfolio performance</span>
        <span class="chips"><span>1D</span><span class="on">1W</span><span>1M</span><span>1Y</span></span>
      </div>
      <svg class="chart" viewBox="0 0 400 150" focusable="false">
        <defs>
          <linearGradient id="auth-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.26" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="grid" d="M0 30H400M0 70H400M0 110H400" />
        <path
          class="area"
          d="M0 118L36 108L72 114L110 92L148 99L186 76L224 84L262 58L300 66L340 40L392 24V150H0Z"
        />
        <path class="line" d="M0 118L36 108L72 114L110 92L148 99L186 76L224 84L262 58L300 66L340 40L392 24" />
        <circle class="dot" cx="392" cy="24" r="5" />
      </svg>
    </div>

    <ul class="features">
      <li>Cash balance and open positions at a glance</li>
      <li>Order placement with a full, filterable history</li>
      <li>Verified accounts and short-lived, rotating sessions</li>
    </ul>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 30rem;
    }

    .headline {
      margin: 0;
      font-size: clamp(1.625rem, 2.4vw, 2.125rem);
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }

    .lede {
      margin: 0.875rem 0 0;
      line-height: 1.55;
      color: var(--tp-text-muted);
    }

    .chart-card {
      margin-top: 2rem;
      padding: 1.25rem;
      background-color: var(--tp-surface);
      border: 1px solid var(--tp-border);
      border-radius: var(--tp-radius-lg);
      box-shadow: var(--tp-shadow);
    }

    .chart-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .chart-title {
      font-size: 0.875rem;
      font-weight: 600;
    }

    .chips {
      display: flex;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--tp-text-muted);
    }

    .chips span {
      padding: 0.125rem 0.5rem;
      border-radius: 0.375rem;
    }

    .chips .on {
      color: var(--tp-text);
      background-color: var(--tp-glow);
      box-shadow: inset 0 0 0 1px var(--tp-border);
    }

    .chart {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
      color: var(--tp-accent);
    }

    .grid {
      stroke: var(--tp-border);
      stroke-dasharray: 3 5;
    }

    .area {
      fill: url(#auth-chart-fill);
    }

    .line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .dot {
      fill: currentColor;
      stroke: var(--tp-surface);
      stroke-width: 3;
    }

    .features {
      display: grid;
      gap: 0.75rem;
      margin: 1.75rem 0 0;
      padding: 0;
      list-style: none;
      font-size: 0.9375rem;
    }

    .features li {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .features li::before {
      content: '';
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
      background-color: var(--tp-accent);
      -webkit-mask: var(--tp-icon-check) center / contain no-repeat;
      mask: var(--tp-icon-check) center / contain no-repeat;
    }
  `]
})
export class AuthShowcaseComponent {}
