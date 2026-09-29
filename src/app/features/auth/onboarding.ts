import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-onboarding',
  template: `
    <div class="mx-auto max-w-sm pt-4 sm:pt-10">
      <form class="grid gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm" (submit)="$event.preventDefault(); submit()">
        <div>
          <h1 class="text-2xl font-bold">{{ config.label('onboarding.title') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ config.label('onboarding.subtitle') }}</p>
        </div>
        <label class="grid gap-1.5 text-sm">
          <span class="font-medium">{{ config.label('onboarding.username') }}</span>
          <input
            class="rounded-xl border border-border bg-background px-3 py-3 outline-none focus:border-primary"
            autocomplete="username"
            [value]="username()"
            (input)="username.set($any($event.target).value)"
            required
          />
        </label>
        @if (!auth.shop()) {
          <label class="grid gap-1.5 text-sm">
            <span class="font-medium">{{ config.label('onboarding.shopName') }}</span>
            <input
              class="rounded-xl border border-border bg-background px-3 py-3 outline-none focus:border-primary"
              [value]="shopName()"
              (input)="shopName.set($any($event.target).value)"
            />
          </label>
        }
        <button type="submit" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || !username().trim()">
          {{ config.label(busy() ? 'common.loading' : 'onboarding.submit') }}
        </button>
      </form>
    </div>
  `,
})
export class Onboarding {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly username = signal('');
  protected readonly shopName = signal('');
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.completeOnboarding(this.username().trim(), this.shopName().trim());
      this.toast.show('onboardingDone', 'success');
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
