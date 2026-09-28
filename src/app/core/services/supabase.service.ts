import { Injectable, Injector, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { EncryptedEnvelope } from '../types/app-settings';
import { EncryptionService } from './encryption.service';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly injector = inject(Injector);

  /** Null until environment.ts has the project URL + anon key (Phase 2). */
  readonly client: SupabaseClient | null =
    environment.supabaseUrl && environment.supabaseAnonKey
      ? createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      : null;

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Plain edge function call, used where encryption is not wanted (e.g. config-loader). */
  async invoke<T>(fn: string, body?: object): Promise<T> {
    const { data, error } = await this.requireClient().functions.invoke<T>(fn, { body });
    if (error) throw error;
    return data as T;
  }

  /**
   * Single integration point for data access: the payload is encrypted, sent to the
   * encrypt-rpc edge function which runs the RPC server side, and the response decrypted.
   */
  async callSecureRpc<T>(rpc: string, params: Record<string, unknown> = {}): Promise<T> {
    // Resolved lazily: EncryptionService -> ConfigService -> SupabaseService would be circular.
    const encryption = this.injector.get(EncryptionService);
    const envelope = await encryption.encrypt({ rpc, params });
    const response = await this.invoke<EncryptedEnvelope>('encrypt-rpc', envelope);
    return encryption.decrypt<T>(response);
  }

  private requireClient(): SupabaseClient {
    if (!this.client) throw new Error('Supabase is not configured in environment.ts');
    return this.client;
  }
}
