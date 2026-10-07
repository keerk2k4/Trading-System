import { Injectable, OnDestroy, signal } from '@angular/core';
import { NotificationTone } from '../ui/notification-kinds';

export interface ToastInput {
  tone: NotificationTone;
  /** SVG path for a 20x20 stroked icon. */
  icon: string;
  /** Read out before the title, e.g. "Order filled". */
  kind: string;
  title: string;
  message: string;
}

export interface Toast extends ToastInput {
  id: number;
}

/** How long a toast stays up, unless the pointer or focus is on it. */
export const TOAST_DURATION_MS = 6000;
/** More than this and the oldest toast makes room. */
export const MAX_TOASTS = 3;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

/**
 * The toasts on screen, newest first. Each closes itself after
 * TOAST_DURATION_MS; pausing (pointer over it, or keyboard focus in it) stops
 * that clock and resuming restarts it with the time that was left.
 */
@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  private readonly items = signal<Toast[]>([]);
  private readonly timers = new Map<number, Timer>();
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  show(input: ToastInput): void {
    const toast: Toast = { ...input, id: this.nextId++ };
    const kept = this.items().slice(0, MAX_TOASTS - 1);
    for (const dropped of this.items().slice(MAX_TOASTS - 1)) {
      this.clearTimer(dropped.id);
    }
    this.items.set([toast, ...kept]);
    this.timers.set(toast.id, { handle: null, remaining: TOAST_DURATION_MS, startedAt: 0 });
    this.resume(toast.id);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.items.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
    this.items.set([]);
  }

  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) {
      return;
    }
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }

  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) {
      return;
    }
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle != null) {
      clearTimeout(timer.handle);
    }
    this.timers.delete(id);
  }
}
