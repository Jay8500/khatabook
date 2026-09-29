import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';

interface LoginCode {
  id: string;
  phone: string;
  code: string;
  message: string;
  created_at: string;
  expires_at: string;
}

/** Pending OTPs (SMS_PROVIDER = inbox) for the admin to forward, e.g. on WhatsApp. */
@Component({
  selector: 'app-login-codes',
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('loginCodes.title') }}</h1>
    <p class="mt-1 max-w-prose text-sm text-muted">{{ config.label('loginCodes.hint') }}</p>

    @if (active().length === 0) {
      <div class="mt-6 rounded-2xl border border-dashed border-border py-12 text-center">
        <span class="mx-auto block size-3 animate-pulse rounded-full bg-primary"></span>
        <p class="mt-3 text-sm text-muted">{{ config.label('loginCodes.empty') }}</p>
      </div>
    } @else {
      <ul class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        @for (c of active(); track c.id) {
          <li class="min-w-0 rounded-2xl border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold tracking-wide">{{ prettyPhone(c.phone) }}</p>
                <p class="mt-0.5 text-xs text-muted">{{ expiresText(c) }}</p>
              </div>
              <p class="font-mono text-3xl font-bold tracking-[0.2em] text-primary">{{ c.code }}</p>
            </div>
            <div class="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <a
                [href]="whatsappUrl(c)"
                target="_blank"
                rel="noopener"
                class="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-success px-3 py-3 text-sm font-semibold text-white"
              >
                <svg viewBox="0 0 24 24" class="size-5" fill="currentColor">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
                </svg>
                {{ config.label('loginCodes.whatsapp') }}
              </a>
              <button type="button" class="whitespace-nowrap rounded-xl border border-border px-3 text-sm font-medium hover:border-primary" (click)="copy(c)">
                {{ config.label('loginCodes.copy') }}
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class LoginCodes {
  protected readonly config = inject(ConfigService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  private readonly codes = signal<LoginCode[]>([]);
  private readonly now = signal(Date.now());
  private seen = new Set<string>();
  private firstLoad = true;

  protected readonly active = computed(() =>
    this.codes().filter((c) => new Date(c.expires_at).getTime() > this.now()),
  );

  constructor() {
    void this.load();
    // New codes arrive while the admin waits on this page; the countdown ticks with it.
    const poll = setInterval(() => void this.load(), 5000);
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      clearInterval(tick);
    });
  }

  private async load(): Promise<void> {
    try {
      const codes = await this.crud.list<LoginCode>('login_codes', {}, 'created_at.desc');
      if (!this.firstLoad) {
        for (const c of codes.filter((c) => !this.seen.has(c.id))) {
          this.toast.show('newLoginCode', 'info', { phone: this.prettyPhone(c.phone) });
        }
      }
      this.seen = new Set(codes.map((c) => c.id));
      this.firstLoad = false;
      this.codes.set(codes);
    } catch (err) {
      console.error(err);
    }
  }

  /** "919876543210" -> "+91 98765 43210" using DEFAULT_COUNTRY_CODE and PHONE_DIGITS. */
  protected prettyPhone(phone: string): string {
    const digits = this.config.get<number>('PHONE_DIGITS') ?? 10;
    const local = phone.slice(-digits);
    const country = phone.slice(0, phone.length - local.length);
    const half = Math.ceil(local.length / 2);
    return `${country ? '+' + country + ' ' : ''}${local.slice(0, half)} ${local.slice(half)}`;
  }

  protected expiresText(c: LoginCode): string {
    const minutes = Math.ceil((new Date(c.expires_at).getTime() - this.now()) / 60000);
    return minutes <= 1
      ? this.config.label('loginCodes.expiringSoon')
      : this.config.label('loginCodes.expiresIn', { minutes });
  }

  protected whatsappUrl(c: LoginCode): string {
    return `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(c.message)}`;
  }

  protected async copy(c: LoginCode): Promise<void> {
    await navigator.clipboard.writeText(c.code);
    this.toast.show('codeCopied', 'success');
  }
}
