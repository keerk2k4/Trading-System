import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../services/toast.service';

/**
 * The toast stack, top right (full width at the top on a phone). Each toast
 * opens the inbox when clicked and has its own close button; the pointer or
 * keyboard focus on a toast holds it on screen. New toasts are announced
 * politely. Styles live in styles.css under "Toasts" (`tp-toast`).
 */
@Component({
  selector: 'app-toast-container',
  imports: [RouterLink],
  template: `
    <section class="tp-toasts" aria-label="New notifications" aria-live="polite" data-testid="toasts">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="tp-toast"
          data-testid="toast"
          (mouseenter)="toasts.pause(toast.id)"
          (mouseleave)="toasts.resume(toast.id)"
          (focusin)="toasts.pause(toast.id)"
          (focusout)="toasts.resume(toast.id)"
        >
          <a class="tp-toast-body" routerLink="/notifications" data-testid="toast-open" (click)="toasts.dismiss(toast.id)">
            <span class="tp-kind" [class]="'tp-kind is-' + toast.tone" aria-hidden="true">
              <svg viewBox="0 0 20 20"><path [attr.d]="toast.icon" /></svg>
            </span>
            <span class="tp-toast-text">
              <span class="sr-only">{{ toast.kind }}:</span>
              <strong class="tp-toast-title" data-testid="toast-title">{{ toast.title }}</strong>
              <span class="tp-toast-message">{{ toast.message }}</span>
            </span>
          </a>
          <button
            type="button"
            class="tp-toast-close"
            data-testid="toast-close"
            [attr.aria-label]="'Dismiss: ' + toast.title"
            (click)="toasts.dismiss(toast.id)"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5l9 9m0-9l-9 9" /></svg>
          </button>
        </div>
      }
    </section>
  `
})
export class ToastContainerComponent {
  protected readonly toasts = inject(ToastService);
}
