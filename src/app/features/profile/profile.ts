import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BUILD_INFO } from '../../core/build-info';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';
import { Avatar } from '../../shared/avatar/avatar';
import { BrandCredit } from '../../shared/brand-credit/brand-credit';
import { ImageRules } from '../../shared/image';

@Component({
  selector: 'app-profile',
  imports: [Avatar, BrandCredit, RouterLink],
  template: `
    <div class="mx-auto grid max-w-lg gap-4">
      <!-- Photo + name -->
      <section class="rounded-3xl border border-border bg-surface p-6 text-center">
        <label class="group relative mx-auto flex w-fit cursor-pointer">
          <app-avatar [url]="profile()?.avatar_url" [name]="auth.displayName()" [size]="104" />
          @if (uploading()) {
            <!-- Loader inside the circle while the photo uploads -->
            <span class="absolute inset-0 grid place-items-center rounded-full bg-black/45">
              <span class="size-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white"></span>
            </span>
          }
          <span class="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full border-4 border-surface bg-primary text-on-primary">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M4 7h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <input type="file" [accept]="acceptTypes" class="hidden" [disabled]="uploading()" (change)="pickPhoto($event)" />
          <span class="sr-only">{{ config.label('profile.changePhoto') }}</span>
        </label>

        <h1 class="mt-4 text-xl font-bold">{{ auth.displayName() }}</h1>
        <p class="text-sm text-muted">{{ phone() }}</p>
      </section>

      <!-- Details -->
      <section class="rounded-3xl border border-border bg-surface p-5">
        <form class="grid gap-1.5 text-sm" (submit)="$event.preventDefault(); saveUsername()">
          <span class="font-medium">{{ config.label(auth.can('can_manage_own_shop') ? 'profile.username' : 'profile.name') }}</span>
          <div class="flex gap-2">
            <input
              class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
              [value]="username()"
              (input)="username.set($any($event.target).value)"
            />
            @if (username().trim() && username().trim() !== auth.displayName()) {
              <button type="submit" class="rounded-xl bg-primary px-4 font-medium text-on-primary" [disabled]="saving()">
                {{ config.label('common.save') }}
              </button>
            }
          </div>
        </form>

        <dl class="mt-5 grid gap-3 text-sm">
          @for (row of details(); track row.label) {
            <div class="flex justify-between gap-4 border-t border-border pt-3">
              <dt class="text-muted">{{ config.label(row.label) }}</dt>
              <dd class="text-right font-medium">{{ row.value }}</dd>
            </div>
          }
        </dl>
      </section>

      <!-- Support -->
      <section class="rounded-3xl border border-border bg-surface p-5">
        <h2 class="font-semibold">{{ config.label('profile.support') }}</h2>
        @if (whatsappUrl(); as url) {
          <p class="mt-1 text-sm text-muted">{{ config.label('profile.supportHint') }}</p>
          <a
            [href]="url"
            target="_blank"
            rel="noopener"
            class="mt-4 flex items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 font-semibold text-white"
          >
            <svg viewBox="0 0 24 24" class="size-5" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
            </svg>
            {{ config.label('profile.whatsapp') }}
          </a>
        }
        <a routerLink="/support" class="mt-3 block rounded-xl border border-border px-4 py-3 text-center font-medium hover:border-primary">
          {{ config.label('profile.ticket') }}
        </a>
      </section>

      <button type="button" class="rounded-xl border border-error/40 px-4 py-3 font-semibold text-error hover:bg-error/10" (click)="logout()">
        {{ config.label('profile.logout') }}
      </button>

      <!-- Version + credit -->
      <footer class="grid gap-1.5 pb-2 pt-3 text-center">
        <app-brand-credit />
        <p class="text-[11px] tracking-wide text-muted/80">
          {{ config.label('profile.version', { version: build.version }) }} · {{ build.commit }}
        </p>
      </footer>
    </div>
  `,
})
export class Profile {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly build = BUILD_INFO;
  protected readonly profile = this.auth.profile;
  protected readonly username = signal(this.auth.displayName());
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  /** File picker filter from AVATAR_IMAGE.types (any image when unset). */
  protected readonly acceptTypes = (this.config.get<ImageRules>('AVATAR_IMAGE')?.types ?? ['image/*']).join(',');
  private readonly planName = signal('');

  protected readonly phone = computed(() => {
    const p = this.profile()?.phone ?? '';
    return p ? `+${p}` : '';
  });

  protected readonly details = computed(() => {
    const shop = this.auth.shop();
    const rows = [{ label: 'profile.role', value: this.auth.context()?.role.name ?? '' }];
    if (shop) {
      rows.push({ label: 'profile.shop', value: shop.name });
      if (this.planName()) rows.push({ label: 'profile.plan', value: this.planName() });
      if (shop.subscription_expires_at) {
        rows.push({ label: 'profile.validTill', value: this.config.date(shop.subscription_expires_at) });
      }
    }
    return rows;
  });

  protected readonly whatsappUrl = computed(() => {
    const number = (this.config.get<string>('SUPPORT_WHATSAPP_NUMBER') ?? '').replace(/\D/g, '');
    if (!number) return null;
    const text = this.config.label('profile.whatsappText', {
      username: this.auth.displayName(),
      shop: this.auth.shop()?.name ?? '-',
    });
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  });

  constructor() {
    void this.loadPlan();
  }

  private async loadPlan(): Promise<void> {
    const planId = this.auth.shop()?.subscription_plan_id;
    if (!planId) return;
    try {
      const [plan] = await this.crud.list('pricing_plans', { id: planId });
      this.planName.set(String(plan?.['name'] ?? ''));
    } catch {
      // Plan name is optional on this page.
    }
  }

  /** ["image/jpeg", "image/png"] -> "JPEG, PNG" */
  private typeNames(types: string[] = []): string {
    return types.map((t) => t.split('/')[1]?.toUpperCase()).join(', ');
  }

  protected async pickPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      const url = await this.auth.uploadAvatar(file);
      this.toast.show('photoUpdated', 'success', undefined, url);
    } catch (err) {
      console.error(err);
      const message = (err as { message?: string } | null)?.message;
      const rules = this.config.get<ImageRules>('AVATAR_IMAGE') ?? {};
      if (message === 'photoType') {
        this.toast.show('photoType', 'warning', { types: this.typeNames(rules.types) });
      } else if (message === 'photoTooBig') {
        this.toast.show('photoTooBig', 'warning', { mb: rules.max_mb });
      } else {
        this.toast.show('photoFailed', 'error');
      }
    } finally {
      this.uploading.set(false);
    }
  }

  protected async saveUsername(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.updateProfile(this.username().trim(), this.profile()?.avatar_url ?? null);
      this.toast.show('saved', 'success');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    this.toast.show('logout', 'info');
    await this.router.navigateByUrl('/login');
  }
}
