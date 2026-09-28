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
  // Phase 2: initial mode is read from users_profile.preferences instead of the OS setting.
  private readonly _mode = signal<ThemeMode>(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  readonly mode = this._mode.asReadonly();

  constructor() {
    effect(() => this.apply(this._mode()));
  }

  toggle(): void {
    this._mode.update((m) => (m === 'dark' ? 'light' : 'dark'));
    // Phase 2: persist to users_profile.preferences via SupabaseService.callSecureRpc.
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
