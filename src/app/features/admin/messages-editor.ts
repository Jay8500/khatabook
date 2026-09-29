import { Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';
import { TemplateEditor, TextVariable, templateParts, variablesFor } from '../../shared/template-editor/template-editor';

interface Entry {
  key: string;
  value: string;
}

/**
 * The text maps listed in app_settings MESSAGE_SETTINGS (UI_LABELS, TOAST_MESSAGES,
 * REMINDER_MESSAGES, ...). Tap a text to change it; variables are inserted from chips.
 */
@Component({
  selector: 'app-messages-editor',
  imports: [TemplateEditor],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('messages.title') }}</h1>
    <p class="mt-1 max-w-prose text-sm text-muted">{{ config.label('messages.hint') }}</p>

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

      @for (group of grouped(); track group.name) {
        @if (grouped().length > 1) {
          <h2 class="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">{{ group.title }}</h2>
        }
        <ul class="grid grid-cols-1 gap-2" [class.mt-3]="grouped().length === 1">
          @for (entry of group.entries; track entry.key) {
            <li class="min-w-0">
              <button
                type="button"
                class="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-left hover:border-primary"
                (click)="open(entry)"
              >
                <span class="min-w-0 text-sm leading-relaxed">
                  @for (part of parts(entry.value); track $index) {
                    @if (part.variable) {
                      <span class="mx-0.5 inline-block rounded-md bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                        {{ variableLabel(entry.key, part.variable) }}
                      </span>
                    } @else {
                      {{ part.text }}
                    }
                  }
                </span>
                <svg viewBox="0 0 24 24" class="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            </li>
          }
        </ul>
      }
    }

    @if (editing(); as entry) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" (click)="editing.set(null)">
        <form
          class="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-6"
          (click)="$event.stopPropagation()"
          (submit)="$event.preventDefault(); save(entry)"
        >
          <h2 class="text-lg font-semibold">{{ config.label('messages.editTitle') }}</h2>
          <p class="mb-4 mt-1 text-xs text-muted">{{ groupTitle(entry.key) }}</p>

          <app-template-editor [(value)]="draft" [variables]="variablesOf(entry)" />

          <div class="mt-6 flex gap-3">
            <button type="button" class="flex-1 rounded-xl border border-border px-4 py-3 font-medium" (click)="editing.set(null)">
              {{ config.label('common.cancel') }}
            </button>
            <button type="submit" class="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary disabled:opacity-50" [disabled]="saving() || !draft().trim()">
              {{ config.label(saving() ? 'common.loading' : 'common.save') }}
            </button>
          </div>
        </form>
      </div>
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
  protected readonly editing = signal<Entry | null>(null);
  protected readonly draft = signal('');
  protected readonly saving = signal(false);
  protected readonly parts = templateParts;

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.entries();
    return q ? list.filter((e) => (e.key + ' ' + e.value).toLowerCase().includes(q)) : list;
  });

  /** Entries grouped by the first part of the key (the screen), e.g. "login.title" -> login. */
  protected readonly grouped = computed(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of this.visible()) {
      const name = this.groupName(entry.key);
      groups.set(name, [...(groups.get(name) ?? []), entry]);
    }
    return [...groups].map(([name, entries]) => ({ name, title: this.titleOf(name), entries }));
  });

  constructor() {
    const first = this.settingKeys()[0];
    if (first) void this.select(first);
  }

  private groupName(key: string): string {
    return key.includes('.') ? key.split('.')[0] : 'other';
  }

  private titleOf(group: string): string {
    const label = 'messages.group.' + group;
    return this.config.hasLabel(label) ? this.config.label(label) : group;
  }

  protected groupTitle(key: string): string {
    const setting = this.config.label('messages.' + this.selected());
    const group = this.groupName(key);
    return group === 'other' ? setting : `${setting} · ${this.titleOf(group)}`;
  }

  protected variablesOf(entry: Entry): TextVariable[] {
    return variablesFor(this.config, `${this.selected()}.${entry.key}`, entry.value);
  }

  protected variableLabel(entryKey: string, variable: string): string {
    const entry = this.entries().find((e) => e.key === entryKey);
    return this.variablesOf(entry ?? { key: entryKey, value: '' }).find((v) => v.key === variable)?.label ?? variable;
  }

  protected async select(key: string): Promise<void> {
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
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected open(entry: Entry): void {
    this.draft.set(entry.value);
    this.editing.set(entry);
  }

  protected async save(entry: Entry): Promise<void> {
    const text = this.draft().trim();
    const next = this.entries().map((e) => (e.key === entry.key ? { ...e, value: text } : e));
    this.saving.set(true);
    try {
      const value = Object.fromEntries(next.map((e) => [e.key, e.value]));
      await this.crud.update('app_settings', this.selected(), { value });
      this.entries.set(next);
      await this.config.load();
      this.editing.set(null);
      this.toast.show('saved', 'success');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
