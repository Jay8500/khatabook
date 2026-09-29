import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { ImageRules, checkImage, compressImage } from '../../shared/image';
import { UserContext } from '../types/models';
import { ConfigService } from './config.service';
import { SupabaseService } from './supabase.service';
import { ThemeService } from './theme.service';

/**
 * Phone OTP session (persisted by Supabase Auth) plus the user's profile, role
 * permissions and shop from get_my_context. Access checks read permissions only;
 * no role names appear in the app.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly config = inject(ConfigService);
  private readonly theme = inject(ThemeService);

  private readonly _session = signal<Session | null>(null);
  private readonly _context = signal<UserContext | null>(null);

  readonly session = this._session.asReadonly();
  readonly context = this._context.asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly profile = computed(() => this._context()?.profile ?? null);
  readonly shop = computed(() => this._context()?.shop ?? null);
  readonly permissions = computed(() => this._context()?.role.permissions ?? {});
  readonly needsOnboarding = computed(() => this.isLoggedIn() && !this.profile()?.username);

  /** Restores the stored session; runs after ConfigService.load(). */
  async init(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    const { data } = await client.auth.getSession();
    this._session.set(data.session);
    client.auth.onAuthStateChange((event, session) => {
      this._session.set(session);
      if (event === 'SIGNED_OUT') this._context.set(null);
    });

    if (data.session) {
      try {
        await this.loadContext();
      } catch (err) {
        console.error('Could not load user context', err);
      }
    }

    // Role or permission changes (e.g. added to Admin phones) apply when the app is
    // opened again, without logging out.
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      const minGap = (this.config.get<number>('CONTEXT_REFRESH_SECONDS') ?? 60) * 1000;
      if (document.visibilityState !== 'visible' || !this.isLoggedIn() || Date.now() - last < minGap) return;
      last = Date.now();
      this.loadContext().catch((err) => console.error(err));
    });
  }

  can(permission: string): boolean {
    return this.permissions()[permission] === true;
  }

  async loadContext(): Promise<void> {
    const context = await this.supabase.callSecureRpc<UserContext | null>('get_my_context');
    this._context.set(context);
    this.theme.setMode(context?.profile.preferences?.['theme']);
  }

  async sendOtp(phone: string): Promise<void> {
    const { error } = await this.supabase.requireClient().auth.signInWithOtp({ phone });
    if (error) throw error;
  }

  async verifyOtp(phone: string, token: string): Promise<void> {
    const { data, error } = await this.supabase
      .requireClient()
      .auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw error;
    this._session.set(data.session);
    // Signed-in users receive more settings (and the encryption key).
    await this.config.load();
    this.theme.apply();
    await this.loadContext();
  }

  async completeOnboarding(username: string, shopName: string): Promise<void> {
    const context = await this.supabase.callSecureRpc<UserContext>('complete_onboarding', {
      p_username: username,
      p_shop_name: shopName,
    });
    this._context.set(context);
  }

  async updateProfile(username: string, avatarUrl: string | null): Promise<void> {
    const context = await this.supabase.callSecureRpc<UserContext>('update_my_profile', {
      p_username: username,
      p_avatar_url: avatarUrl,
    });
    this._context.set(context);
  }

  /** Uploads to <AVATARS_BUCKET>/<user id>/avatar.jpg and saves the public URL on the profile. */
  async uploadAvatar(file: File): Promise<string> {
    const profile = this.profile();
    const bucket = this.config.get<string>('AVATARS_BUCKET');
    if (!profile || !bucket) throw new Error('photoFailed');

    const rules = this.config.get<ImageRules>('AVATAR_IMAGE');
    const problem = checkImage(file, rules);
    if (problem) throw new Error(problem);

    const blob = await compressImage(file, rules);
    const path = `${profile.id}/avatar.jpg`;
    const storage = this.supabase.requireClient().storage.from(bucket);
    const { error } = await storage.upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;

    // Same path on every upload, so bust caches with a version query.
    const url = `${storage.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    await this.updateProfile(profile.username ?? '', url);
    return url;
  }

  async savePreference(key: string, value: unknown): Promise<void> {
    if (!this.isLoggedIn()) return;
    await this.supabase.callSecureRpc('set_my_preferences', { p_preferences: { [key]: value } });
  }

  async signOut(): Promise<void> {
    await this.supabase.requireClient().auth.signOut();
    this._session.set(null);
    this._context.set(null);
    await this.config.load();
    // Back to the app default; the next user's own preference applies after login.
    this.theme.applyDefault();
  }
}
