import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { CrudService } from './crud.service';
import { ToastService } from './toast.service';

interface PendingCode {
  id: string;
  phone: string;
  expires_at: string;
}

/**
 * For admins who forward login codes: checks for new codes on every screen, shows a
 * pop-up, vibrates the phone and keeps a count for the Admin tab badge.
 */
@Injectable({ providedIn: 'root' })
export class LoginCodeWatchService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  private readonly _pending = signal(0);
  readonly pending = this._pending.asReadonly();

  private timer?: ReturnType<typeof setInterval>;
  private seen: Set<string> | null = null;

  constructor() {
    // Runs only while the signed-in user may see login codes.
    effect(() => {
      const allowed = this.auth.can('can_view_login_codes');
      clearInterval(this.timer);
      this.seen = null;
      this._pending.set(0);
      if (!allowed) return;
      const seconds = this.config.get<number>('LOGIN_CODE_POLL_SECONDS') ?? 10;
      void this.check();
      this.timer = setInterval(() => void this.check(), seconds * 1000);
    });
  }

  private async check(): Promise<void> {
    if (document.visibilityState !== 'visible') return;
    try {
      const now = Date.now();
      const codes = (await this.crud.list<PendingCode>('login_codes')).filter(
        (c) => new Date(c.expires_at).getTime() > now,
      );
      const fresh = this.seen ? codes.filter((c) => !this.seen!.has(c.id)) : [];
      this.seen = new Set(codes.map((c) => c.id));
      this._pending.set(codes.length);

      if (fresh.length && !location.pathname.startsWith('/admin/login-codes')) {
        for (const c of fresh) this.toast.show('newLoginCode', 'info', { phone: `+${c.phone}` }, undefined, true);
        navigator.vibrate?.([200, 100, 200]);
      }
    } catch {
      // Offline or signed out; the next tick tries again.
    }
  }
}
