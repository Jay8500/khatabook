import { Injectable, inject } from '@angular/core';
import { EncryptedEnvelope } from '../types/app-settings';
import { ConfigService } from './config.service';

/** AES-GCM helpers; the key (base64, 256-bit) comes from app_settings ENCRYPTION_KEY. */
@Injectable({ providedIn: 'root' })
export class EncryptionService {
  private readonly config = inject(ConfigService);
  private cached?: { raw: string; key: Promise<CryptoKey> };

  async encrypt(payload: unknown): Promise<EncryptedEnvelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(payload));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(), plain);
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
  }

  async decrypt<T>(envelope: EncryptedEnvelope): Promise<T> {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
      await this.key(),
      fromBase64(envelope.data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  }

  private key(): Promise<CryptoKey> {
    const raw = this.config.get<string>('ENCRYPTION_KEY');
    if (!raw) return Promise.reject(new Error('ENCRYPTION_KEY is not set in app_settings'));
    if (this.cached?.raw !== raw) {
      const key = crypto.subtle.importKey('raw', fromBase64(raw), 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      this.cached = { raw, key };
    }
    return this.cached.key;
  }
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
