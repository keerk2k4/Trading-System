import { Component, input } from '@angular/core';

/**
 * What an account status allows, as two short facts: "Can sign in" /
 * "Can't sign in" and "Can place orders" / "Orders refused". The words carry
 * the meaning; the drawn tick or cross and its colour only reinforce it.
 * Styles live in styles.css under "Choice cards" (`tp-facts`).
 */
@Component({
  selector: 'app-access-facts',
  template: `
    <ul class="tp-facts">
      <li [class.is-yes]="signIn()">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          @if (signIn()) {
            <path d="M3.5 8.5l3 3 6-7" />
          } @else {
            <path d="M4.5 4.5l7 7m0-7l-7 7" />
          }
        </svg>
        <span>{{ signIn() ? 'Can sign in' : "Can't sign in" }}</span>
      </li>
      <li [class.is-yes]="orders()">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          @if (orders()) {
            <path d="M3.5 8.5l3 3 6-7" />
          } @else {
            <path d="M4.5 4.5l7 7m0-7l-7 7" />
          }
        </svg>
        <span>{{ orders() ? 'Can place orders' : 'Orders refused' }}</span>
      </li>
    </ul>
  `
})
export class AccessFactsComponent {
  readonly signIn = input.required<boolean>();
  readonly orders = input.required<boolean>();
}
