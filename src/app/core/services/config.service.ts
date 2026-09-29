import { Injectable, computed, inject, signal } from '@angular/core';
import { AppSettings, Brand, ConfigSource } from '../types/app-settings';
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
  readonly logoUrl = computed(() => this.get<string>('APP_LOGO_URL'));
  readonly brand = computed(() => this.get<Brand>('BRAND'));

  async load(): Promise<void> {
    if (this.supabase.isConfigured) {
      try {
        const remote = await this.supabase.invoke<AppSettings>('config-loader');
        if (Object.keys(remote).length === 0) throw new Error('app_settings is empty');
        this._settings.set(remote);
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

  label(key: string, vars?: Record<string, unknown>): string {
    return format(this.message('UI_LABELS', key), vars);
  }

  /** Values of a jsonb array setting (ISSUE_TYPES, TICKET_STATUSES, ...). */
  list(key: string): string[] {
    const value = this.get<unknown>(key);
    return Array.isArray(value) ? value.map(String) : [];
  }

  /** Formats a number/date with LOCALE and CURRENCY settings. */
  money(value: unknown): string {
    const currency = this.get<string>('CURRENCY_CODE');
    const n = Number(value ?? 0);
    return currency
      ? n.toLocaleString(this.get<string>('LOCALE'), { style: 'currency', currency })
      : n.toLocaleString(this.get<string>('LOCALE'));
  }

  date(value: unknown): string {
    return value ? new Date(String(value)).toLocaleDateString(this.get<string>('LOCALE')) : '';
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

/** Replaces {name} placeholders in a settings text. */
export function format(text: string, vars?: Record<string, unknown>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}
