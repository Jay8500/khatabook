/** Key/value map mirroring the app_settings table (key -> value jsonb). */
export type AppSettings = Record<string, unknown>;

/** Theme palette per mode; each key becomes a --app-<key> CSS variable. */
export interface ThemeColors {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export type ThemeMode = keyof ThemeColors;

export type ConfigSource = 'remote' | 'bootstrap';

/** Payload shape exchanged with the encrypt-rpc edge function. */
export interface EncryptedEnvelope {
  iv: string;
  data: string;
}
