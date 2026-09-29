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
                  [value]="phone()"
                  (input)="phone.set(digits($any($event.target).value))"
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
            <p class="text-sm">{{ config.label('login.otpSentTo', { phone: fullPhone() }) }}</p>
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">{{ config.label('login.otp') }}</span>
              <input
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                class="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary"
                [value]="otp()"
                (input)="otp.set(digits($any($event.target).value))"
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

  protected digits(value: string): string {
    return value.replace(/\D/g, '');
  }

  protected fullPhone(): string {
    return `${this.countryCode}${this.phone()}`;
  }

  protected async send(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.sendOtp(this.fullPhone());
      this.step.set('otp');
      this.toast.show('otpSent', 'success');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.verifyOtp(this.fullPhone(), this.otp());
      this.toast.show('loginSuccess', 'success');
      await this.router.navigateByUrl(this.auth.needsOnboarding() ? '/onboarding' : '/');
    } catch (err) {
      this.toast.show('loginFailed', 'error');
      console.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
