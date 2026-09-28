/** Key/value map mirroring the app_settings table (key -> value jsonb). */
export type AppSettings = Record<string, unknown>;

/** Theme palette per mode; each key becomes a --app-<key> CSS variable. */
export interface ThemeColors {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export type ThemeMode = keyof ThemeColors;

/** app_settings BRAND: the "Powered by" credit in the footer. */
export interface Brand {
  name: string;
  url?: string;
  logoUrl?: string;
}

/** One entry of app_settings APP_ICONS, in web manifest icon format. */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

export type ConfigSource = 'remote' | 'bootstrap';

/** Payload shape exchanged with the encrypt-rpc edge function. */
export interface EncryptedEnvelope {
  iv: string;
  data: string;
}
