import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tp_theme';

/**
 * Light/dark theme. Until the user picks one, the page follows the OS colour
 * scheme through CSS alone; a choice is pinned on <html data-theme> and
 * remembered in this browser.
 */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly current = signal<Theme>(this.initialTheme());
  readonly theme = this.current.asReadonly();

  constructor() {
    const stored = this.readStored();
    if (stored) {
      this.document.documentElement.dataset['theme'] = stored;
    }
  }

  toggle(): void {
    const next: Theme = this.current() === 'dark' ? 'light' : 'dark';
    this.current.set(next);
    this.document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies now.
    }
  }

  private initialTheme(): Theme {
    const stored = this.readStored();
    if (stored) {
      return stored;
    }
    const prefersDark = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  private readStored(): Theme | null {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }
}
