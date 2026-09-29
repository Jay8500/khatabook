import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-login',
  template: `
    <div class="mx-auto max-w-sm pt-4 sm:pt-10">
      <div class="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <h1 class="text-2xl font-bold">{{ config.label('login.title') }}</h1>
        <p class="mt-1 text-sm text-muted">{{ config.label('login.subtitle') }}</p>

        @if (step() === 'phone') {
          <form class="mt-6 grid gap-4" (submit)="$event.preventDefault(); send()">
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">{{ config.label('login.phone') }}</span>
              <div class="flex overflow-hidden rounded-xl border border-border bg-background focus-within:border-primary">
                <span class="grid place-items-center border-r border-border px-3 text-muted">{{ countryCode }}</span>
                <input
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  class="w-full bg-transparent px-3 py-3 text-lg tracking-wide outline-none"
                  [placeholder]="config.label('login.phonePlaceholder')"
                  [attr.maxlength]="phoneDigits || null"
                  [value]="phone()"
                  (input)="phone.set(digits($any($event.target).value, phoneDigits))"
                  required
                />
              </div>
            </label>
            <button type="submit" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || !phone()">
              {{ config.label(busy() ? 'common.loading' : 'login.sendOtp') }}
            </button>
          </form>
        } @else {
          <form class="mt-6 grid gap-4" (submit)="$event.preventDefault(); verify()">
            <div>
              <p class="text-sm">{{ config.label('login.otpSentTo', { phone: fullPhone() }) }}</p>
              <p class="mt-1 text-xs text-muted">{{ config.label('login.otpHint') }}</p>
            </div>
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">{{ config.label('login.otp') }}</span>
              <input
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                class="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary"
                [attr.maxlength]="otpLength || null"
                [value]="otp()"
                (input)="otp.set(digits($any($event.target).value, otpLength))"
                required
              />
            </label>
            <button type="submit" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || !otp()">
              {{ config.label(busy() ? 'common.loading' : 'login.verify') }}
            </button>
            <div class="flex justify-between text-sm">
              <button type="button" class="text-muted hover:text-text" (click)="step.set('phone'); otp.set('')">
                {{ config.label('login.changePhone') }}
              </button>
              <button type="button" class="font-medium text-info" [disabled]="busy()" (click)="send()">
                {{ config.label('login.resend') }}
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class Login {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly countryCode = this.config.get<string>('DEFAULT_COUNTRY_CODE') ?? '';
  protected readonly step = signal<'phone' | 'otp'>('phone');
  protected readonly phone = signal('');
  protected readonly otp = signal('');
  protected readonly busy = signal(false);
  /** Expected lengths from app_settings (PHONE_DIGITS, OTP_LENGTH); 0 = not checked. */
  protected readonly phoneDigits = this.config.get<number>('PHONE_DIGITS') ?? 0;
  protected readonly otpLength = this.config.get<number>('OTP_LENGTH') ?? 0;

  protected digits(value: string, max = 0): string {
    const d = value.replace(/\D/g, '');
    return max ? d.slice(0, max) : d;
  }

  /** Supabase auth error code -> TOAST_MESSAGES "auth.<code>", else the fallback key. */
  private authError(err: unknown, fallback: string): void {
    const code = (err as { code?: string } | null)?.code;
    const key = code ? `auth.${code}` : '';
    const known = key && this.config.get<Record<string, string>>('TOAST_MESSAGES')?.[key];
    console.error(err);
    this.toast.show(known ? key : fallback, 'error');
  }

  protected fullPhone(): string {
    return `${this.countryCode}${this.phone()}`;
  }

  protected async send(): Promise<void> {
    if (this.phoneDigits && this.phone().length !== this.phoneDigits) {
      this.toast.show('invalidPhone', 'warning', { digits: this.phoneDigits });
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.sendOtp(this.fullPhone());
      this.step.set('otp');
      this.toast.show('otpSent', 'success');
    } catch (err) {
      this.authError(err, 'otpSendFailed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    if (this.otpLength && this.otp().length !== this.otpLength) {
      this.toast.show('invalidOtpLength', 'warning', { digits: this.otpLength });
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.verifyOtp(this.fullPhone(), this.otp());
      this.toast.show('loginSuccess', 'success');
      await this.router.navigateByUrl(this.auth.needsOnboarding() ? '/onboarding' : '/');
    } catch (err) {
      this.otp.set('');
      this.authError(err, 'loginFailed');
    } finally {
      this.busy.set(false);
    }
  }
}
