import { TestBed } from '@angular/core/testing';
import { PnlValueComponent } from './pnl-value.component';

describe('PnlValueComponent', () => {
  function render(value: number | null | undefined, kind: 'currency' | 'percent' = 'currency'): HTMLElement {
    const fixture = TestBed.createComponent(PnlValueComponent);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('signs and colours gains and losses', () => {
    const gain = render(1234.5);
    expect(gain.textContent).toBe('+$1,234.50');
    expect(gain.classList).toContain('tp-positive');

    const loss = render(-3.2, 'percent');
    expect(loss.textContent).toBe('-3.20%');
    expect(loss.classList).toContain('tp-negative');
  });

  it('shows a muted dash when not applicable and an unsigned zero', () => {
    const missing = render(null);
    expect(missing.textContent).toBe('—');
    expect(missing.classList).toContain('tp-muted');

    const zero = render(0, 'percent');
    expect(zero.textContent).toBe('0.00%');
    expect(zero.classList).not.toContain('tp-positive');
    expect(zero.classList).not.toContain('tp-negative');
  });
});
