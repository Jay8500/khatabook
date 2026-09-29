import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';

const KEY = 'ADMIN_PHONES';
const digits = (v: string) => v.replace(/\D/g, '');

/** Edits app_settings ADMIN_PHONES; the database promotes/demotes users on save. */
@Component({
  selector: 'app-admin-phones',
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('adminPhones.title') }}</h1>
    <p class="mt-1 max-w-prose text-sm text-muted">{{ config.label('adminPhones.hint') }}</p>

    <form class="mt-5 flex gap-2" (submit)="$event.preventDefault(); add()">
      <input
        type="tel"
        class="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-primary"
        [placeholder]="config.label('adminPhones.placeholder')"
        [value]="draft()"
        (input)="draft.set($any($event.target).value)"
      />
      <button type="submit" class="rounded-xl bg-primary px-4 py-2.5 font-medium text-on-primary">
        {{ config.label('common.add') }}
      </button>
    </form>

    <ul class="mt-4 grid gap-2">
      @for (phone of phones(); track phone) {
        <li class="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
          <span class="font-medium tracking-wide">{{ phone }}</span>
          <button type="button" class="text-sm font-medium text-error" (click)="remove(phone)">
            {{ config.label('common.delete') }}
          </button>
        </li>
      }
    </ul>

    <button
      type="button"
      class="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50 sm:w-auto"
      [disabled]="saving() || !dirty()"
      (click)="save()"
    >
      {{ config.label(saving() ? 'common.loading' : 'common.save') }}
    </button>
  `,
})
export class AdminPhones {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly phones = signal<string[]>([]);
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [row] = await this.crud.list('app_settings', { key: KEY });
      this.phones.set(Array.isArray(row?.['value']) ? (row['value'] as string[]) : []);
      this.dirty.set(false);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected add(): void {
    const code = digits(this.config.get<string>('DEFAULT_COUNTRY_CODE') ?? '');
    let phone = digits(this.draft());
    if (!phone) return;
    // Numbers typed without the country code get the default one.
    if (code && !phone.startsWith(code)) phone = code + phone;
    if (!this.phones().includes(phone)) {
      this.phones.update((list) => [...list, phone]);
      this.dirty.set(true);
    }
    this.draft.set('');
  }

  protected remove(phone: string): void {
    const own = digits(this.auth.profile()?.phone ?? '');
    if (digits(phone) === own && !confirm(this.config.label('adminPhones.removeSelf'))) return;
    this.phones.update((list) => list.filter((p) => p !== phone));
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    if (this.phones().length === 0) {
      this.toast.show('adminPhonesEmpty', 'warning');
      return;
    }
    this.saving.set(true);
    try {
      await this.crud.update('app_settings', KEY, { value: this.phones() });
      this.toast.show('saved', 'success');
      await this.auth.loadContext();
      await this.load();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
