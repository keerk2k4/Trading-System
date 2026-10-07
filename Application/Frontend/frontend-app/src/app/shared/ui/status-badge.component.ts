import { Component, computed, input } from '@angular/core';

type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

const TONES: Record<string, Tone> = {
  FILLED: 'positive',
  ORDER_FILLED: 'positive',
  APPROVED: 'positive',
  ACTIVE: 'positive',
  SENT: 'positive',
  PARTIALLY_FILLED: 'warning',
  PENDING: 'warning',
  ORDER_CANCELLED: 'warning',
  CANCELLED: 'warning',
  QUEUED: 'warning',
  REJECTED: 'negative',
  ORDER_REJECTED: 'negative',
  FAILED: 'negative',
  SUSPENDED: 'negative',
  CLOSED: 'negative',
  // Service health
  UP: 'positive',
  DEGRADED: 'warning',
  DOWN: 'negative'
};

/**
 * Status pill for order, KYC, account and service-health states. The label is the status in
 * words ("PARTIALLY_FILLED" -> "Partially filled"), so colour is never the
 * only cue.
 */
@Component({
  selector: 'app-status-badge',
  template: `{{ label() }}`,
  host: {
    class: 'tp-badge',
    '[class.tp-badge-positive]': "tone() === 'positive'",
    '[class.tp-badge-negative]': "tone() === 'negative'",
    '[class.tp-badge-warning]': "tone() === 'warning'"
  }
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();

  protected readonly tone = computed<Tone>(() => TONES[this.status()] ?? 'neutral');
  protected readonly label = computed(() => {
    const words = this.status().replace(/_/g, ' ').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  });
}
