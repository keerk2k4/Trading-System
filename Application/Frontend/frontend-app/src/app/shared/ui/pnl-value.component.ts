import { Component, LOCALE_ID, computed, inject, input } from '@angular/core';
import { formatCurrency, formatNumber, getCurrencySymbol } from '@angular/common';

type PnlKind = 'currency' | 'percent';

/**
 * Signed profit-and-loss figure: "+$200.00" / "-$150.00" or "+8.50%" /
 * "-3.20%". Gains are green, losses red, and a missing value (not
 * applicable) is a muted "—". The sign is always written out, so colour is
 * never the only cue.
 */
@Component({
  selector: 'app-pnl-value',
  template: `{{ text() }}`,
  host: {
    class: 'tp-num',
    '[class.tp-positive]': "tone() === 'positive'",
    '[class.tp-negative]': "tone() === 'negative'",
    '[class.tp-muted]': "tone() === 'none'"
  }
})
export class PnlValueComponent {
  private readonly locale = inject(LOCALE_ID);

  readonly value = input<number | null | undefined>(null);
  readonly kind = input<PnlKind>('currency');
  readonly currency = input('USD');

  protected readonly tone = computed(() => {
    const value = this.value();
    if (value === null || value === undefined || Number.isNaN(value)) {
      return 'none';
    }
    return value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
  });

  protected readonly text = computed(() => {
    const value = this.value();
    if (this.tone() === 'none') {
      return '—';
    }
    const amount = Math.abs(value as number);
    const sign = this.tone() === 'positive' ? '+' : this.tone() === 'negative' ? '-' : '';
    const formatted =
      this.kind() === 'percent'
        ? formatNumber(amount, this.locale, '1.2-2') + '%'
        : formatCurrency(amount, this.locale, getCurrencySymbol(this.currency(), 'wide', this.locale), this.currency(), '1.2-2');
    return sign + formatted;
  });
}
