import { Injectable, inject } from '@angular/core';
import { ManifestIcon, ThemeColors } from '../types/app-settings';
import { ConfigService } from './config.service';

/**
 * Rebuilds the web app manifest from app_settings so the installed app name and
 * colors follow the admin settings. The static public/manifest.webmanifest is only
 * the pre-boot fallback.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly config = inject(ConfigService);

  apply(): void {
    const name = this.config.get<string>('APP_NAME');
    if (!name) return;
    document.title = name;

    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;

    const light = this.config.get<ThemeColors>('THEME_COLORS')?.light ?? {};
    const base = new URL(document.baseURI);
    const manifest = {
      name,
      short_name: this.config.get<string>('APP_SHORT_NAME') ?? name,
      description: this.config.get<string>('APP_DESCRIPTION'),
      display: 'standalone',
      start_url: base.href,
      scope: base.href,
      theme_color: light['primary'],
      background_color: light['background'],
      // Blob manifests resolve relative URLs against blob:, so make icon paths absolute.
      icons: (this.config.get<ManifestIcon[]>('APP_ICONS') ?? []).map((icon) => ({
        ...icon,
        src: new URL(icon.src, base).href,
      })),
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    link.href = URL.createObjectURL(blob);
  }
}
