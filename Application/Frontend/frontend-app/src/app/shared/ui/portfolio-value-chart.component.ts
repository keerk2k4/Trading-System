import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PortfolioHistoryPoint } from '../models/portfolio.models';
import { PnlValueComponent } from './pnl-value.component';

type Mode = 'pnl' | 'return' | 'stocks' | 'value';

interface Range {
  label: string;
  /** Number of trading days shown; 0 shows every point. */
  days: number;
}

interface Series {
  key: string;
  label: string;
  path: string;
  /** CSS class for the stroke; `color` overrides it for per-instrument lines. */
  kind: 'main' | 'benchmark' | 'cost' | 'average' | 'symbol';
  color?: string;
  /** Where to write the label at the line's end, for per-instrument lines. */
  end?: { x: number; y: number };
}

const RANGES: Range[] = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 130 },
  { label: 'All', days: 0 }
];

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'pnl', label: 'P&L' },
  { mode: 'return', label: 'Return %' },
  { mode: 'stocks', label: 'By stock' },
  { mode: 'value', label: 'Value' }
];

/** Trailing window of the moving average, in trading days. */
const AVERAGE_DAYS = 20;

// SVG drawing area, in viewBox units. The right margin holds the axis and line labels.
const WIDTH = 640;
const HEIGHT = 260;
const TOP = 12;
const BOTTOM = 22;
const RIGHT = 64;
const MARKER = 6;

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** A round step (1, 2 or 5 x a power of ten) giving about `count` gridlines across the range. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

function compact(value: number): string {
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
}

/** Trailing mean over up to `days` points; null until a full window is available. */
function movingAverage(values: number[], days: number): (number | null)[] {
  let sum = 0;
  return values.map((value, i) => {
    sum += value;
    if (i >= days) {
      sum -= values[i - days];
    }
    return i >= days - 1 ? sum / days : null;
  });
}

/**
 * The portfolio over time, in four views.
 *
 * P&L (the default): total profit and loss to date, unrealised plus realised.
 * Trades do not move it, prices do, so it shows how the holdings performed.
 *
 * Return %: the time-weighted return, against an equal-weight buy-and-hold of
 * every instrument with saved prices ("market"). Being in percent, it reads
 * the same for a small account and a large one.
 *
 * By stock: the P&L line split into one line per instrument, to show which
 * holding drove the result.
 *
 * Value: what the holdings were worth (solid) against what they cost
 * (dashed). It steps on every trade, because cash is turned into shares.
 *
 * P&L and Return % can add a 20-day moving average, to show the trend
 * through day-to-day noise. Buys are marked with an upward triangle, sells
 * with a downward one. Hovering a day shows its figures above the chart.
 */
@Component({
  selector: 'app-portfolio-value-chart',
  imports: [CurrencyPipe, DecimalPipe, PnlValueComponent],
  template: `
    <div class="chart" data-testid="portfolio-chart">
      <div class="chart-header">
        <div class="toggles" role="group" aria-label="Chart view">
          @for (m of modes; track m.mode) {
            <button type="button" class="range" [class.is-active]="mode() === m.mode" [attr.aria-pressed]="mode() === m.mode"
                    [attr.data-testid]="'portfolio-mode-' + m.mode" (click)="mode.set(m.mode); hovered.set(null)">{{ m.label }}</button>
          }
        </div>
        <div class="ranges" role="group" aria-label="Chart range">
          @for (range of ranges; track range.label) {
            <button
              type="button"
              class="range"
              [class.is-active]="range.label === rangeLabel()"
              [attr.aria-pressed]="range.label === rangeLabel()"
              [attr.data-testid]="'portfolio-range-' + range.label"
              (click)="rangeLabel.set(range.label); hovered.set(null)"
            >
              {{ range.label }}
            </button>
          }
        </div>
      </div>

      @if (view(); as v) {
        <div class="legend">
          @for (s of v.series; track s.key) {
            <span [class]="'key key-' + s.kind" [style.--key-color]="s.color" [attr.data-testid]="'portfolio-legend-' + s.key">{{ s.label }}</span>
          }
          @if (mode() === 'pnl' || mode() === 'return') {
            <label>
              <input type="checkbox" [checked]="showAverage()" (change)="showAverage.set(!showAverage())" data-testid="portfolio-average-toggle" />
              Show trend
            </label>
          }
        </div>

        @if (focused(); as p) {
          <p class="readout tp-num" data-testid="portfolio-chart-readout">
            <span>{{ p.date }}</span>
            @switch (mode()) {
              @case ('pnl') {
                <span>Total <app-pnl-value [value]="p.totalPnl" [currency]="currency()" /></span>
                <span>Unrealised <app-pnl-value [value]="p.marketValue - p.costBasis" [currency]="currency()" /></span>
                <span>Realised <app-pnl-value [value]="p.realisedPnl" [currency]="currency()" /></span>
              }
              @case ('return') {
                <span>Portfolio <app-pnl-value kind="percent" [value]="p.returnPct" /></span>
                <span>Market <app-pnl-value kind="percent" [value]="p.marketReturnPct" /></span>
                @if (p.marketReturnPct !== null) {
                  <span>Difference <app-pnl-value kind="percent" [value]="p.returnPct - p.marketReturnPct" /></span>
                }
              }
              @case ('stocks') {
                @for (symbol of symbols(); track symbol) {
                  @if (p.pnlBySymbol[symbol] !== undefined) {
                    <span>{{ symbol }} <app-pnl-value [value]="p.pnlBySymbol[symbol]" [currency]="currency()" /></span>
                  }
                }
              }
              @default {
                <span>Value {{ p.marketValue | currency: currency() }}</span>
                <span>Cost {{ p.costBasis | currency: currency() }}</span>
              }
            }
            @for (t of p.trades; track $index) {
              <span class="trade">{{ t.side }} {{ t.quantity | number }} {{ t.symbol }} &#64; {{ t.price | currency: currency() }}</span>
            }
            @if (p.synthetic) {
              <span class="tp-muted">Includes a price carried over a market holiday or filled in by the provider</span>
            }
          </p>
        }
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          role="img"
          [attr.aria-label]="v.summary"
          (mouseleave)="hovered.set(null)"
        >
          @for (line of v.grid; track line.y) {
            <line class="grid" x1="0" [attr.x2]="plotRight" [attr.y1]="line.y" [attr.y2]="line.y" />
            <text class="axis" [attr.x]="plotRight + 6" [attr.y]="line.y + 4">{{ line.label }}</text>
          }
          @for (tick of v.dates; track tick.x) {
            <text class="axis" [attr.x]="tick.x" [attr.y]="height - 6" text-anchor="middle">{{ tick.label }}</text>
          }
          @if (v.zeroY !== null) {
            <line class="zero" x1="0" [attr.x2]="plotRight" [attr.y1]="v.zeroY" [attr.y2]="v.zeroY" data-testid="portfolio-zero-line" />
          }
          @if (v.gapPath) {
            <path class="gap" [attr.d]="v.gapPath" />
          }
          @for (s of v.series; track s.key) {
            <path [attr.class]="'line line-' + s.kind" [style.stroke]="s.color" [attr.d]="s.path" [attr.data-testid]="'portfolio-line-' + s.key" />
            @if (s.end) {
              <text class="line-label" [style.fill]="s.color" [attr.x]="s.end.x + 4" [attr.y]="s.end.y + 4">{{ s.label }}</text>
            }
          }
          @for (m of v.markers; track m.key) {
            <path [attr.class]="m.side === 'BUY' ? 'marker buy' : 'marker sell'" [attr.d]="m.d" data-testid="portfolio-trade-marker">
              <title>{{ m.label }}</title>
            </path>
          }
          @for (x of v.hits; track $index; let i = $index) {
            <rect class="hit" [attr.x]="x - v.step / 2" [attr.y]="top" [attr.width]="v.step" [attr.height]="plotHeight" (mouseenter)="hovered.set(i)" />
          }
          @if (hovered() !== null) {
            <line class="cursor" [attr.x1]="v.hits[hovered()!]" [attr.x2]="v.hits[hovered()!]" [attr.y1]="top" [attr.y2]="top + plotHeight" />
          }
        </svg>
        @if (mode() === 'return' && benchmarkSymbols().length > 0) {
          <p class="note tp-muted" data-testid="portfolio-benchmark-note">
            Both lines run from your first trade. Market: the same amount put into each of
            {{ benchmarkSymbols().join(', ') }} that day and held. Return % is time-weighted, so buying more
            does not move it; only prices do.
          </p>
        }
      } @else {
        <p class="tp-muted" data-testid="portfolio-chart-empty">No filled trades to chart yet.</p>
      }
    </div>
  `,
  styles: [`
    .chart { padding: 0.75rem; border: 1px solid var(--tp-border); border-radius: var(--tp-radius); background: var(--tp-surface-raised); }
    .chart-header, .legend, .toggles, .ranges, .readout { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
    .chart-header { justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
    .legend, .readout { gap: 0.25rem 1rem; margin: 0 0 0.25rem; font-size: 0.8125rem; color: var(--tp-text-muted); }
    .key::before { content: ''; display: inline-block; width: 1.25rem; margin-right: 0.375rem; vertical-align: middle; border-top: 2px solid var(--tp-accent); }
    .key-benchmark::before, .key-cost::before { border-top-style: dashed; border-top-color: var(--tp-text-muted); }
    .key-average::before { border-top-color: var(--tp-warning); }
    .key-symbol::before { border-top-color: var(--key-color); }
    .range { font: inherit; font-size: 0.75rem; padding: 0.125rem 0.5rem; cursor: pointer; border: 1px solid var(--tp-border); border-radius: var(--tp-radius); background: none; color: var(--tp-text-muted); }
    .range.is-active { border-color: var(--tp-accent); color: var(--tp-text); font-weight: 600; }
    .range:focus-visible { outline: 2px solid var(--tp-focus); outline-offset: 2px; }
    .trade { color: var(--tp-text); font-weight: 600; }
    .note { margin: 0.5rem 0 0; font-size: 0.75rem; }
    svg { display: block; width: 100%; height: auto; }
    .grid { stroke: var(--tp-border); }
    .zero, .cursor { stroke: var(--tp-border-strong); }
    .axis, .line-label { font-size: 11px; fill: var(--tp-text-muted); }
    .line-label { font-weight: 600; }
    .gap { fill: var(--tp-accent); opacity: 0.08; }
    .line { fill: none; stroke-width: 2; stroke-linejoin: round; }
    .line-main { stroke: var(--tp-accent); }
    .line-benchmark, .line-cost { stroke: var(--tp-text-muted); stroke-width: 1.5; stroke-dasharray: 5 4; }
    .line-average { stroke: var(--tp-warning); }
    .marker { stroke: var(--tp-surface); }
    .buy { fill: var(--tp-positive); }
    .sell { fill: var(--tp-negative); }
    .hit { fill: transparent; }
  `]
})
export class PortfolioValueChartComponent {
  readonly points = input<PortfolioHistoryPoint[]>([]);
  readonly currency = input('USD');
  /** Instruments in the market comparison, named under the Return % view. */
  readonly benchmarkSymbols = input<string[]>([]);

  protected readonly ranges = RANGES;
  protected readonly modes = MODES;
  protected readonly averageDays = AVERAGE_DAYS;
  protected readonly mode = signal<Mode>('pnl');
  protected readonly showAverage = signal(false);
  protected readonly rangeLabel = signal('All');
  protected readonly hovered = signal<number | null>(null);

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly top = TOP;
  protected readonly plotRight = WIDTH - RIGHT;
  protected readonly plotHeight = HEIGHT - TOP - BOTTOM;

  /** Every instrument that appears in pnlBySymbol, in the order first held. */
  protected readonly symbols = computed(() => {
    const seen: string[] = [];
    for (const point of this.points()) {
      for (const symbol of Object.keys(point.pnlBySymbol ?? {})) {
        if (!seen.includes(symbol)) {
          seen.push(symbol);
        }
      }
    }
    return seen;
  });

  private readonly visible = computed(() => {
    const days = RANGES.find((range) => range.label === this.rangeLabel())?.days ?? 0;
    const points = this.points();
    return days > 0 ? points.slice(-days) : points;
  });

  /** The hovered day, or the latest one. */
  protected readonly focused = computed(() => {
    const points = this.visible();
    const index = this.hovered();
    return (index !== null ? points[index] : undefined) ?? points.at(-1) ?? null;
  });

  protected readonly view = computed(() => {
    const points = this.visible();
    if (points.length === 0) {
      return null;
    }
    const mode = this.mode();
    const all = this.points();
    const offset = all.length - points.length;

    // Each series as one value (or a gap) per visible day.
    const lines: { key: string; label: string; kind: Series['kind']; color?: string; values: (number | null)[] }[] = [];
    const averageOf = (pick: (p: PortfolioHistoryPoint) => number) =>
      // Averaged over the whole history, so the first days of a short range still have a value.
      movingAverage(all.map(pick), AVERAGE_DAYS).slice(offset);

    if (mode === 'pnl') {
      lines.push({ key: 'pnl', label: 'Total P&L (unrealised + realised)', kind: 'main', values: points.map((p) => p.totalPnl) });
      if (this.showAverage()) {
        lines.push({ key: 'average', label: `${AVERAGE_DAYS}-day average`, kind: 'average', values: averageOf((p) => p.totalPnl) });
      }
    } else if (mode === 'return') {
      // Both since the first trade, so the readout and the lines always agree.
      lines.push({ key: 'return', label: 'Portfolio return', kind: 'main', values: points.map((p) => p.returnPct) });
      if (points.some((p) => p.marketReturnPct !== null)) {
        lines.push({ key: 'market', label: 'Market (equal-weight)', kind: 'benchmark', values: points.map((p) => p.marketReturnPct) });
      }
      if (this.showAverage()) {
        lines.push({ key: 'average', label: `${AVERAGE_DAYS}-day average`, kind: 'average', values: averageOf((p) => p.returnPct) });
      }
    } else if (mode === 'stocks') {
      this.symbols().forEach((symbol, i) =>
        lines.push({
          key: `symbol-${symbol}`,
          label: symbol,
          kind: 'symbol',
          color: `var(--tp-series-${(i % 8) + 1})`,
          values: points.map((p) => p.pnlBySymbol?.[symbol] ?? null)
        })
      );
    } else {
      lines.push({ key: 'value', label: 'Market value', kind: 'main', values: points.map((p) => p.marketValue) });
      lines.push({ key: 'cost', label: 'Cost basis', kind: 'cost', values: points.map((p) => p.costBasis) });
    }

    // Value is drawn from zero; the others around a zero line.
    const values = lines.flatMap((l) => l.values.filter((v): v is number => v !== null));
    const centred = mode !== 'value';
    if (centred) {
      values.push(0);
    }
    let low = Math.min(...values);
    let high = Math.max(...values);
    const pad = (high - low) * 0.08 || Math.abs(high) * 0.05 || 1;
    low = centred ? low - pad : Math.max(0, low - pad);
    high += pad;
    const gridStep = niceStep(high - low, 4);
    low = Math.floor(low / gridStep) * gridStep;
    high = Math.ceil(high / gridStep) * gridStep;

    const step = this.plotRight / points.length;
    const x = (i: number) => step * i + step / 2;
    const y = (value: number) => TOP + ((high - value) / (high - low)) * this.plotHeight;
    const path = (series: (number | null)[]) => {
      let pen = 'M';
      return series
        .map((v, i) => {
          if (v === null) {
            pen = 'M';
            return '';
          }
          const segment = `${pen}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          pen = 'L';
          return segment;
        })
        .filter(Boolean)
        .join(' ');
    };

    const series: Series[] = lines.map((l) => {
      const lastIndex = l.values.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
      return {
        key: l.key,
        label: l.label,
        kind: l.kind,
        color: l.color,
        path: path(l.values),
        end: l.kind === 'symbol' && lastIndex >= 0 ? { x: x(lastIndex), y: y(l.values[lastIndex] as number) } : undefined
      };
    });

    // Keep line-end labels at least one text line apart.
    const labelled = series.filter((s) => s.end).sort((a, b) => a.end!.y - b.end!.y);
    for (let i = 1; i < labelled.length; i++) {
      const above = labelled[i - 1].end!;
      const end = labelled[i].end!;
      if (end.y - above.y < 12) {
        labelled[i].end = { x: end.x, y: above.y + 12 };
      }
    }

    let gapPath: string | null = null;
    if (mode === 'value') {
      const valuePath = series[0].path;
      const back = points
        .map((p, i) => ({ i, p }))
        .reverse()
        .map(({ i, p }) => `L${x(i).toFixed(1)},${y(p.costBasis).toFixed(1)}`)
        .join(' ');
      gapPath = `${valuePath} ${back} Z`;
    }

    // Trade markers sit on the line they belong to: buys below, sells above, inside the plot.
    const minY = TOP + MARKER;
    const maxY = TOP + this.plotHeight - MARKER;
    const lineFor = (symbol: string) => (mode === 'stocks' ? lines.find((l) => l.label === symbol) : lines[0]);
    const markers = points.flatMap((p, i) =>
      p.trades.map((t, n) => {
        const at = lineFor(t.symbol)?.values[i] ?? lines[0].values[i] ?? 0;
        const cx = Math.min(Math.max(x(i), MARKER + 1), this.plotRight - MARKER - 1);
        const shift = t.side === 'BUY' ? MARKER + 4 : -(MARKER + 4);
        const cy = Math.min(Math.max(y(at) + shift, minY), maxY);
        const d =
          t.side === 'BUY'
            ? `M${cx},${cy - MARKER} L${cx + MARKER},${cy + MARKER} L${cx - MARKER},${cy + MARKER} Z`
            : `M${cx},${cy + MARKER} L${cx + MARKER},${cy - MARKER} L${cx - MARKER},${cy - MARKER} Z`;
        return { key: `${p.date}-${n}`, side: t.side, d, label: `${p.date}: ${t.side} ${t.quantity} ${t.symbol} at ${t.price}` };
      })
    );

    const percent = mode === 'return';
    const grid: { y: number; label: string }[] = [];
    for (let value = high; value >= low - gridStep / 2; value -= gridStep) {
      const v = Math.abs(value) < gridStep / 2 ? 0 : value;
      grid.push({ y: y(v), label: percent ? `${Number(v.toFixed(1))}%` : compact(v) });
    }

    const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const dates = tickIndexes.map((i) => ({
      // Keep the first and last labels inside the plot.
      x: Math.min(Math.max(x(i), 24), this.plotRight - 24),
      label: formatDate(points[i].date)
    }));

    const first = points[0];
    const last = points[points.length - 1];
    const span = `from ${formatDate(first.date)} to ${formatDate(last.date)}`;
    const ends = lines
      .map((l) => {
        const v = [...l.values].reverse().find((value) => value !== null);
        return v === undefined || v === null ? null : `${l.label} ${percent ? v.toFixed(2) + '%' : v.toFixed(2)}`;
      })
      .filter(Boolean)
      .join(', ');
    const summary = `${MODES.find((m) => m.mode === mode)!.label} ${span}. On the last day: ${ends}. ${markers.length} trades marked.`;

    return {
      series,
      gapPath,
      zeroY: centred ? y(0) : null,
      markers,
      grid,
      dates,
      step,
      hits: points.map((_, i) => x(i)),
      summary
    };
  });
}
