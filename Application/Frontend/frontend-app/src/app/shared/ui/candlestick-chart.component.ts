import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { Candle } from '../models/candle.models';
import { CandleService, UnknownInstrumentError } from '../services/candle.service';

type ChartState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; candles: Candle[] }
  | { status: 'error'; message: string };

interface Range {
  label: string;
  /** Number of trading days shown; 0 shows every candle. */
  days: number;
}

const RANGES: Range[] = [
  { label: '1M', days: 22 },
  { label: '3M', days: 66 },
  { label: '6M', days: 130 },
  { label: '1Y', days: 0 }
];

// SVG drawing area, in viewBox units. The right margin holds the price axis.
const WIDTH = 640;
const HEIGHT = 260;
const TOP = 10;
const BOTTOM = 22;
const RIGHT = 58;

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Daily candlestick chart for one instrument. Green bodies closed higher than
 * they opened, red ones lower; the thin wick spans the day's low to high.
 * Hovering a candle shows its prices above the chart.
 */
@Component({
  selector: 'app-candlestick-chart',
  imports: [CurrencyPipe],
  template: `
    <div class="chart" data-testid="candle-chart">
      <div class="chart-header">
        <strong>{{ symbol() }}</strong>
        <div class="ranges" role="group" aria-label="Chart range">
          @for (range of ranges; track range.label) {
            <button
              type="button"
              class="range"
              [class.is-active]="range.label === rangeLabel()"
              [attr.aria-pressed]="range.label === rangeLabel()"
              [attr.data-testid]="'candle-range-' + range.label"
              (click)="rangeLabel.set(range.label); hovered.set(null)"
            >
              {{ range.label }}
            </button>
          }
        </div>
      </div>

      @switch (state().status) {
        @case ('loading') {
          <p class="tp-muted" role="status" data-testid="candle-loading">Loading chart…</p>
        }
        @case ('error') {
          <div class="tp-alert tp-alert-error" role="alert" data-testid="candle-error">
            <span>{{ errorMessage() }}</span>
          </div>
        }
        @case ('ready') {
          @if (view(); as v) {
            @if (focused(); as c) {
              <p class="ohlc tp-num" data-testid="candle-ohlc">
                <span>{{ c.date }}</span>
                <span>O {{ c.open | currency }}</span>
                <span>H {{ c.high | currency }}</span>
                <span>L {{ c.low | currency }}</span>
                <span [class.tp-positive]="c.close >= c.open" [class.tp-negative]="c.close < c.open">C {{ c.close | currency }}</span>
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
              @for (bar of v.bars; track bar.date; let i = $index) {
                <g [class.up]="bar.up" [class.down]="!bar.up" data-testid="candle" (mouseenter)="hovered.set(i)">
                  <rect class="hit" [attr.x]="bar.x - v.step / 2" [attr.y]="top" [attr.width]="v.step" [attr.height]="plotHeight" />
                  <line class="wick" [attr.x1]="bar.x" [attr.x2]="bar.x" [attr.y1]="bar.highY" [attr.y2]="bar.lowY" />
                  <rect class="body" [attr.x]="bar.x - v.body / 2" [attr.y]="bar.bodyY" [attr.width]="v.body" [attr.height]="bar.bodyHeight" />
                </g>
              }
            </svg>
          } @else {
            <p class="tp-muted" data-testid="candle-empty">No candle data for {{ symbol() }}.</p>
          }
        }
      }
    </div>
  `,
  styles: [`
    .chart { margin-top: 0.75rem; padding: 0.75rem; border: 1px solid var(--tp-border); border-radius: var(--tp-radius); background-color: var(--tp-surface-raised); }
    .chart-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; }
    .ranges { display: flex; gap: 0.25rem; }
    .range {
      font: inherit; font-size: 0.75rem; padding: 0.125rem 0.5rem; cursor: pointer;
      border: 1px solid var(--tp-border); border-radius: var(--tp-radius); background: transparent; color: var(--tp-text-muted);
    }
    .range.is-active { border-color: var(--tp-accent); color: var(--tp-text); font-weight: 600; }
    .range:focus-visible { outline: 2px solid var(--tp-focus); outline-offset: 2px; }
    .ohlc { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; margin: 0 0 0.25rem; font-size: 0.8125rem; color: var(--tp-text-muted); }
    svg { display: block; width: 100%; height: auto; }
    .grid { stroke: var(--tp-border); stroke-width: 1; }
    .axis { fill: var(--tp-text-muted); font-size: 11px; }
    .hit { fill: transparent; }
    .wick { stroke-width: 1; }
    .up .wick { stroke: var(--tp-positive); }
    .up .body { fill: var(--tp-positive); }
    .down .wick { stroke: var(--tp-negative); }
    .down .body { fill: var(--tp-negative); }
    g:hover .hit { fill: var(--tp-border); opacity: 0.5; }
  `]
})
export class CandlestickChartComponent {
  private readonly candleService = inject(CandleService);

  readonly symbol = input.required<string>();

  protected readonly ranges = RANGES;
  protected readonly rangeLabel = signal('3M');
  protected readonly hovered = signal<number | null>(null);

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly top = TOP;
  protected readonly plotRight = WIDTH - RIGHT;
  protected readonly plotHeight = HEIGHT - TOP - BOTTOM;

  protected readonly state = toSignal(
    toObservable(this.symbol).pipe(switchMap((symbol) => this.load(symbol))),
    { initialValue: { status: 'idle' } as ChartState }
  );

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });

  /** Candles inside the selected range, oldest first. */
  private readonly visible = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') {
      return [];
    }
    const days = RANGES.find((range) => range.label === this.rangeLabel())?.days ?? 0;
    return days > 0 ? state.candles.slice(-days) : state.candles;
  });

  /** The hovered candle, or the latest one. */
  protected readonly focused = computed(() => {
    const candles = this.visible();
    const index = this.hovered();
    return (index !== null ? candles[index] : undefined) ?? candles.at(-1) ?? null;
  });

  protected readonly view = computed(() => {
    const candles = this.visible();
    if (candles.length === 0) {
      return null;
    }
    let low = Math.min(...candles.map((c) => c.low));
    let high = Math.max(...candles.map((c) => c.high));
    const pad = (high - low) * 0.05 || high * 0.01 || 1;
    low -= pad;
    high += pad;

    const plotWidth = this.plotRight;
    const step = plotWidth / candles.length;
    const y = (price: number) => TOP + ((high - price) / (high - low)) * this.plotHeight;

    const bars = candles.map((c, i) => {
      const openY = y(c.open);
      const closeY = y(c.close);
      return {
        date: c.date,
        up: c.close >= c.open,
        x: step * i + step / 2,
        highY: y(c.high),
        lowY: y(c.low),
        bodyY: Math.min(openY, closeY),
        // A flat day still gets a visible 1-unit body.
        bodyHeight: Math.max(1, Math.abs(closeY - openY))
      };
    });

    const grid = [0, 1, 2, 3, 4].map((n) => {
      const price = high - ((high - low) * n) / 4;
      return { y: y(price), label: price.toFixed(2) };
    });

    const tickIndexes = [...new Set([0, Math.floor((candles.length - 1) / 2), candles.length - 1])];
    const dates = tickIndexes.map((i) => ({
      // Keep the first and last labels inside the plot.
      x: Math.min(Math.max(bars[i].x, 24), plotWidth - 24),
      label: formatDate(candles[i].date)
    }));

    const first = candles[0];
    const last = candles[candles.length - 1];
    const summary =
      `${this.symbol()} daily candles from ${formatDate(first.date)} to ${formatDate(last.date)}. ` +
      `Last close ${last.close.toFixed(2)}, range ${Math.min(...candles.map((c) => c.low)).toFixed(2)} ` +
      `to ${Math.max(...candles.map((c) => c.high)).toFixed(2)}.`;

    return { bars, grid, dates, step, body: Math.max(1, step * 0.6), summary };
  });

  private load(symbol: string): Observable<ChartState> {
    if (!symbol) {
      return of({ status: 'idle' });
    }
    return this.candleService.getCandles(symbol).pipe(
      map((candles): ChartState => ({ status: 'ready', candles })),
      startWith<ChartState>({ status: 'loading' }),
      catchError((err: unknown) =>
        of<ChartState>({
          status: 'error',
          message:
            err instanceof UnknownInstrumentError
              ? `There is no such instrument: ${err.symbol}. No chart data is available for it.`
              : `The chart for ${symbol} could not be loaded. Please try again.`
        })
      )
    );
  }
}
