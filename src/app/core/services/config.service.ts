import { Injectable, computed, inject, signal } from '@angular/core';
import { AppSettings, ConfigSource } from '../types/app-settings';
import { SupabaseService } from './supabase.service';

/**
 * Loads every admin-managed value (app_settings) once at startup.
 * Remote source: the config-loader edge function. Until Supabase is connected, or if it
 * is unreachable, it falls back to /config/bootstrap.json, which is the same data that
 * seeds app_settings in the Phase 2 migration.
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly supabase = inject(SupabaseService);
  private readonly _settings = signal<AppSettings>({});
  private readonly _source = signal<ConfigSource>('bootstrap');

  readonly settings = this._settings.asReadonly();
  readonly source = this._source.asReadonly();
  readonly appName = computed(() => this.get<string>('APP_NAME') ?? '');

  async load(): Promise<void> {
    if (this.supabase.isConfigured) {
      try {
        this._settings.set(await this.supabase.invoke<AppSettings>('config-loader'));
        this._source.set('remote');
        return;
      } catch (err) {
        console.warn('config-loader unavailable, using bootstrap config', err);
      }
    }
    this._settings.set(await this.loadBootstrap());
    this._source.set('bootstrap');
  }

  get<T>(key: string): T | undefined {
    return this._settings()[key] as T | undefined;
  }

  /** Text from a jsonb map setting (UI_LABELS, TOAST_MESSAGES, ...); falls back to the key. */
  message(settingKey: string, messageKey: string): string {
    return this.get<Record<string, string>>(settingKey)?.[messageKey] ?? messageKey;
  }

  label(key: string): string {
    return this.message('UI_LABELS', key);
  }

  private async loadBootstrap(): Promise<AppSettings> {
    try {
      const res = await fetch('config/bootstrap.json', { cache: 'no-cache' });
      return res.ok ? ((await res.json()) as AppSettings) : {};
    } catch {
      return {};
    }
  }
}
