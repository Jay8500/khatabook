import { Injectable, effect, inject, signal } from '@angular/core';
import { ThemeColors, ThemeMode } from '../types/app-settings';
import { ConfigService } from './config.service';

/**
 * Turns app_settings THEME_COLORS into --app-* CSS variables on <html>, which
 * styles.css maps to Tailwind colors (bg-primary, text-text, ...). Components never
 * hold color values themselves.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly config = inject(ConfigService);
  // Light until applyDefault() reads DEFAULT_THEME; a signed-in user's
  // users_profile.preferences.theme overrides it.
  private readonly _mode = signal<ThemeMode>('light');
  readonly mode = this._mode.asReadonly();

  constructor() {
    effect(() => this.apply(this._mode()));
  }

  /** app_settings DEFAULT_THEME: "light", "dark" or "system" (follow the phone). */
  applyDefault(): void {
    const setting = this.config.get<string>('DEFAULT_THEME');
    if (setting === 'system') {
      this._mode.set(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else {
      this.setMode(setting);
    }
    this.apply();
  }

  /** Flips the mode and returns the new one (AuthService persists it to the profile). */
  toggle(): ThemeMode {
    this._mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
    return this._mode();
  }

  setMode(mode: unknown): void {
    if (mode === 'light' || mode === 'dark') this._mode.set(mode);
  }

  apply(mode: ThemeMode = this._mode()): void {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');

    const palette = this.config.get<ThemeColors>('THEME_COLORS')?.[mode] ?? {};
    for (const [name, value] of Object.entries(palette)) {
      root.style.setProperty(`--app-${kebab(name)}`, value);
    }
    if (palette['primary']) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette['primary']);
    }
  }
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
