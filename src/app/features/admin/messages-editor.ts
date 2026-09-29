import { Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';

interface Entry {
  key: string;
  value: string;
}

/**
 * Key/value editor for the text maps listed in app_settings MESSAGE_SETTINGS
 * (UI_LABELS, TOAST_MESSAGES, REMINDER_MESSAGES, ...).
 */
@Component({
  selector: 'app-messages-editor',
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('messages.title') }}</h1>

    <div class="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
      @for (key of settingKeys(); track key) {
        <button
          type="button"
          class="shrink-0 rounded-full border px-4 py-2 text-sm font-medium"
          [class]="key === selected() ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'"
          (click)="select(key)"
        >
          {{ config.label('messages.' + key) }}
        </button>
      }
    </div>

    @if (selected()) {
      <input
        type="search"
        class="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        [placeholder]="config.label('common.search')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />

      <div class="mt-3 grid gap-2">
        @for (entry of visible(); track entry.key) {
          <div class="grid gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[16rem_1fr_auto] sm:items-center">
            <code class="truncate text-xs text-muted" [title]="entry.key">{{ entry.key }}</code>
            <input
              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              [value]="entry.value"
              (input)="setValue(entry.key, $any($event.target).value)"
            />
            <button type="button" class="justify-self-end text-sm font-medium text-error" (click)="removeKey(entry.key)">
              {{ config.label('common.delete') }}
            </button>
          </div>
        }
      </div>

      <form class="mt-4 grid gap-2 sm:grid-cols-[16rem_1fr_auto]" (submit)="$event.preventDefault(); addKey()">
        <input
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          [placeholder]="config.label('messages.newKey')"
          [value]="newKey()"
          (input)="newKey.set($any($event.target).value)"
        />
        <input
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          [placeholder]="config.label('messages.newValue')"
          [value]="newValue()"
          (input)="newValue.set($any($event.target).value)"
        />
        <button type="submit" class="rounded-lg border border-border px-4 py-2 text-sm font-medium">+ {{ config.label('common.add') }}</button>
      </form>

      @if (dirty()) {
        <button
          type="button"
          class="sticky bottom-4 mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary shadow-lg sm:w-auto"
          [disabled]="saving()"
          (click)="save()"
        >
          {{ config.label(saving() ? 'common.loading' : 'common.save') }}
        </button>
      }
    }
  `,
})
export class MessagesEditor {
  protected readonly config = inject(ConfigService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly settingKeys = computed(() => this.config.list('MESSAGE_SETTINGS'));
  protected readonly selected = signal('');
  protected readonly entries = signal<Entry[]>([]);
  protected readonly query = signal('');
  protected readonly newKey = signal('');
  protected readonly newValue = signal('');
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.entries();
    return q ? list.filter((e) => (e.key + ' ' + e.value).toLowerCase().includes(q)) : list;
  });

  constructor() {
    const first = this.settingKeys()[0];
    if (first) void this.select(first);
  }

  protected async select(key: string): Promise<void> {
    if (this.dirty() && !confirm(this.config.label('messages.discard'))) return;
    this.selected.set(key);
    this.query.set('');
    try {
      const [row] = await this.crud.list('app_settings', { key });
      const value = (row?.['value'] ?? {}) as Record<string, string>;
      this.entries.set(
        Object.entries(value)
          .map(([k, v]) => ({ key: k, value: String(v) }))
          .sort((a, b) => a.key.localeCompare(b.key)),
      );
      this.dirty.set(false);
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected setValue(key: string, value: string): void {
    this.entries.update((list) => list.map((e) => (e.key === key ? { ...e, value } : e)));
    this.dirty.set(true);
  }

  protected removeKey(key: string): void {
    this.entries.update((list) => list.filter((e) => e.key !== key));
    this.dirty.set(true);
  }

  protected addKey(): void {
    const key = this.newKey().trim();
    if (!key || this.entries().some((e) => e.key === key)) return;
    this.entries.update((list) => [...list, { key, value: this.newValue() }]);
    this.newKey.set('');
    this.newValue.set('');
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const value = Object.fromEntries(this.entries().map((e) => [e.key, e.value]));
      await this.crud.update('app_settings', this.selected(), { value });
      await this.config.load();
      this.dirty.set(false);
      this.toast.show('saved', 'success');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
