import { Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { PwaService } from '../../core/services/pwa.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { TemplateEditor, TextVariable } from '../../shared/template-editor/template-editor';

interface SettingRow {
  key: string;
  value: unknown;
  visibility: string;
  category: string;
  description: string | null;
}

type Kind = 'choice' | 'text' | 'longtext' | 'number' | 'boolean' | 'time' | 'list' | 'colors' | 'json';

const HEX = /^#[0-9a-f]{3,8}$/i;

function kindOf(value: unknown): Kind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (/^\d{2}:\d{2}$/.test(value)) return 'time';
    return value.length > 60 ? 'longtext' : 'text';
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'list';
  if (isColorMap(value)) return 'colors';
  return 'json';
}

/** { light: { primary: '#..', ... }, dark: { ... } } */
function isColorMap(value: unknown): value is Record<string, Record<string, string>> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (group) =>
        !!group &&
        typeof group === 'object' &&
        Object.values(group as object).every((c) => typeof c === 'string' && HEX.test(c)),
    )
  );
}

/** "LOW_STOCK_LIMIT" / "onPrimary" -> "Low stock limit" / "On primary" */
function humanize(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Component({
  selector: 'app-settings-page',
  imports: [TemplateEditor],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('settings.title') }}</h1>
    <p class="mt-1 max-w-prose text-sm text-muted">{{ config.label('settings.hint') }}</p>

    <input
      type="search"
      class="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
      [placeholder]="config.label('common.search')"
      [value]="query()"
      (input)="query.set($any($event.target).value)"
    />

    @for (group of groups(); track group.category; let last = $last) {
      <section class="mt-6">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-muted">
            {{ config.label('settings.category.' + group.category) }}
          </h2>
          @if (last && !query()) {
            <button type="button" class="text-xs font-medium text-info" (click)="showLast.set(!showLast())">
              {{ config.label(showLast() ? 'settings.hideAdvanced' : 'settings.showAdvanced') }}
            </button>
          }
        </div>

        @if (!last || showLast() || query()) {
          <ul class="grid grid-cols-1 gap-2">
            @for (row of group.rows; track row.key) {
              <li class="min-w-0">
                <button
                  type="button"
                  class="flex w-full min-w-0 items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-left hover:border-primary"
                  (click)="edit(row)"
                >
                  <span class="min-w-0">
                    <span class="block font-medium">{{ name(row.key) }}</span>
                    <span class="mt-0.5 block text-xs text-muted">{{ row.description }}</span>
                  </span>
                  <span class="max-w-[45%] shrink-0 text-right text-sm">
                    @switch (kindFor(row)) {
                      @case ('choice') {
                        <span class="font-medium">{{ choiceLabel(row.value) }}</span>
                      }
                      @case ('boolean') {
                        <span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class]="row.value ? 'bg-success/15 text-success' : 'bg-muted/15 text-muted'">
                          {{ config.label(row.value ? 'settings.on' : 'settings.off') }}
                        </span>
                      }
                      @case ('colors') {
                        <span class="flex flex-wrap justify-end gap-1">
                          @for (c of swatches(row.value); track $index) {
                            <span class="size-4 rounded-full border border-border" [style.background]="c"></span>
                          }
                        </span>
                      }
                      @case ('list') {
                        <span class="line-clamp-2 font-medium wrap-anywhere">{{ listPreview(row.value) }}</span>
                      }
                      @case ('json') {
                        <span class="text-xs text-muted">{{ config.label('settings.items', { count: size(row.value) }) }}</span>
                      }
                      @default {
                        <span class="line-clamp-2 font-medium wrap-anywhere">{{ text(row.value) }}</span>
                      }
                    }
                  </span>
                </button>
              </li>
            }
          </ul>
        }
      </section>
    }

    @if (editing(); as row) {
      <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" (click)="editing.set(null)">
        <form
          class="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-6"
          (click)="$event.stopPropagation()"
          (submit)="$event.preventDefault(); save(row)"
        >
          <h2 class="text-lg font-semibold">{{ name(row.key) }}</h2>
          <p class="mt-1 text-sm text-muted">{{ row.description }}</p>

          <div class="mt-5">
            @if (settingVariables().length) {
              <app-template-editor [value]="$any(draft())" (valueChange)="draft.set($event)" [variables]="settingVariables()" />
            } @else {
            @switch (draftKind()) {
              @case ('choice') {
                <div class="grid gap-2" [style.grid-template-columns]="'repeat(' + choices().length + ', minmax(0, 1fr))'">
                  @for (c of choices(); track c) {
                    <button
                      type="button"
                      class="rounded-xl border px-3 py-3 text-sm font-medium"
                      [class]="draft() === c ? 'border-primary bg-primary text-on-primary' : 'border-border bg-background'"
                      (click)="draft.set(c)"
                    >
                      {{ choiceLabel(c) }}
                    </button>
                  }
                </div>
              }
              @case ('boolean') {
                <button
                  type="button"
                  role="switch"
                  [attr.aria-checked]="draft() === true"
                  class="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3"
                  (click)="draft.set(draft() !== true)"
                >
                  <span class="font-medium">{{ config.label(draft() ? 'settings.on' : 'settings.off') }}</span>
                  <span class="relative h-6 w-11 rounded-full transition" [class]="draft() ? 'bg-success' : 'bg-muted/40'">
                    <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" [style.left.px]="draft() ? 22 : 2"></span>
                  </span>
                </button>
              }
              @case ('number') {
                <input type="number" step="any" [class]="inputClass" [value]="draft()" (input)="draft.set(+$any($event.target).value)" />
              }
              @case ('time') {
                <input type="time" [class]="inputClass + ' text-lg'" [value]="draft()" (input)="draft.set($any($event.target).value)" />
              }
              @case ('longtext') {
                <textarea rows="4" [class]="inputClass" [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
              }
              @case ('list') {
                <div class="flex flex-wrap gap-2">
                  @for (item of listDraft(); track $index; let i = $index) {
                    <span class="flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-3 pr-1 text-sm">
                      {{ item }}
                      <button type="button" class="grid size-6 place-items-center rounded-full text-muted hover:bg-error/10 hover:text-error" [attr.aria-label]="config.label('common.delete')" (click)="removeItem(i)">&times;</button>
                    </span>
                  }
                </div>
                <div class="mt-3 flex gap-2">
                  <input
                    [class]="inputClass"
                    [placeholder]="config.label('settings.itemPlaceholder')"
                    [value]="newItem()"
                    (input)="newItem.set($any($event.target).value)"
                    (keydown.enter)="$event.preventDefault(); addItem()"
                  />
                  <button type="button" class="shrink-0 rounded-xl border border-border px-4 font-medium" (click)="addItem()">+ {{ config.label('common.add') }}</button>
                </div>
              }
              @case ('colors') {
                @for (mode of colorModes(); track mode) {
                  <h3 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0">
                    {{ config.hasLabel('settings.mode.' + mode) ? config.label('settings.mode.' + mode) : mode }}
                  </h3>
                  <div class="grid grid-cols-2 gap-2">
                    @for (entry of colorEntries(mode); track entry.name) {
                      <label class="flex items-center gap-2 rounded-xl border border-border bg-background p-2 text-sm">
                        <input type="color" class="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" [value]="entry.value" (input)="setColor(mode, entry.name, $any($event.target).value)" />
                        <span class="min-w-0 truncate">{{ humanize(entry.name) }}</span>
                      </label>
                    }
                  </div>
                }
              }
              @case ('json') {
                <label class="grid gap-1.5 text-sm">
                  <span class="font-medium">{{ config.label('settings.json') }}</span>
                  <textarea rows="10" spellcheck="false" [class]="inputClass + ' font-mono text-xs'" [value]="jsonDraft()" (input)="jsonDraft.set($any($event.target).value)"></textarea>
                </label>
              }
              @default {
                <input [class]="inputClass" [value]="draft()" (input)="draft.set($any($event.target).value)" />
              }
            }
            }
          </div>

          <label class="mt-5 grid gap-1.5 text-sm">
            <span class="text-muted">{{ config.label('settings.whoSees') }}</span>
            <select [class]="inputClass" (change)="visibility.set($any($event.target).value)">
              @for (v of config.list('SETTING_VISIBILITIES'); track v) {
                <option [value]="v" [selected]="v === visibility()">{{ config.label('settings.visibility.' + v) }}</option>
              }
            </select>
          </label>

          <div class="mt-6 flex gap-3">
            <button type="button" class="flex-1 rounded-xl border border-border px-4 py-3 font-medium" (click)="editing.set(null)">
              {{ config.label('common.cancel') }}
            </button>
            <button type="submit" class="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary disabled:opacity-50" [disabled]="saving()">
              {{ config.label(saving() ? 'common.loading' : 'common.save') }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class SettingsPage {
  protected readonly config = inject(ConfigService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);
  private readonly theme = inject(ThemeService);
  private readonly pwa = inject(PwaService);

  protected readonly inputClass =
    'w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary';
  protected readonly humanize = humanize;
  protected readonly kind = kindOf;

  private readonly rows = signal<SettingRow[]>([]);
  protected readonly query = signal('');
  protected readonly showLast = signal(false);
  protected readonly editing = signal<SettingRow | null>(null);
  protected readonly draft = signal<unknown>(null);
  protected readonly jsonDraft = signal('');
  protected readonly visibility = signal('');
  protected readonly newItem = signal('');
  protected readonly saving = signal(false);

  /** Text settings with placeholders (e.g. OTP_SMS_TEMPLATE) get the chip editor. */
  protected readonly settingVariables = computed(() => {
    const row = this.editing();
    if (!row || typeof row.value !== 'string') return [];
    return this.config.get<Record<string, TextVariable[]>>('TEXT_VARIABLES')?.[row.key] ?? [];
  });

  protected readonly draftKind = computed(() => {
    const row = this.editing();
    return row ? this.kindFor(row) : 'text';
  });

  /** Allowed values for the setting being edited (SETTING_CHOICES). */
  protected readonly choices = computed(() => {
    const row = this.editing();
    return row ? this.choicesOf(row.key) : [];
  });

  /** Settings grouped by SETTING_CATEGORIES order; other categories have their own screens. */
  protected readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    const match = (r: SettingRow) =>
      !q || `${this.name(r.key)} ${r.description ?? ''} ${r.key}`.toLowerCase().includes(q);
    return this.config
      .list('SETTING_CATEGORIES')
      .map((category) => ({ category, rows: this.rows().filter((r) => r.category === category && match(r)) }))
      .filter((g) => g.rows.length > 0);
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.rows.set(await this.crud.list<SettingRow>('app_settings', {}, 'key'));
    } catch (err) {
      this.toast.error(err);
    }
  }

  private choicesOf(key: string): string[] {
    return this.config.get<Record<string, string[]>>('SETTING_CHOICES')?.[key] ?? [];
  }

  protected kindFor(row: SettingRow): Kind {
    return this.choicesOf(row.key).length ? 'choice' : kindOf(row.value);
  }

  protected choiceLabel(value: unknown): string {
    const label = `settings.choice.${String(value)}`;
    return this.config.hasLabel(label) ? this.config.label(label) : String(value);
  }

  protected name(key: string): string {
    const label = `settingName.${key}`;
    return this.config.hasLabel(label) ? this.config.label(label) : humanize(key);
  }

  protected text(value: unknown): string {
    return value === '' || value === null || value === undefined ? this.config.label('settings.empty') : String(value);
  }

  protected listPreview(value: unknown): string {
    const list = value as string[];
    return list.length ? list.join(', ') : this.config.label('settings.empty');
  }

  protected size(value: unknown): number {
    return Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 0;
  }

  protected swatches(value: unknown): string[] {
    const map = value as Record<string, Record<string, string>>;
    return Object.values(map).flatMap((group) => [group['primary'], group['background']].filter(Boolean)).slice(0, 6);
  }

  // ---- editing ---------------------------------------------------------------
  protected edit(row: SettingRow): void {
    this.draft.set(structuredClone(row.value));
    this.jsonDraft.set(JSON.stringify(row.value, null, 2));
    this.visibility.set(row.visibility);
    this.newItem.set('');
    this.editing.set(row);
  }

  protected listDraft(): string[] {
    return (this.draft() as string[]) ?? [];
  }

  protected addItem(): void {
    const item = this.newItem().trim();
    if (!item || this.listDraft().includes(item)) return;
    this.draft.set([...this.listDraft(), item]);
    this.newItem.set('');
  }

  protected removeItem(index: number): void {
    this.draft.set(this.listDraft().filter((_, i) => i !== index));
  }

  protected colorModes(): string[] {
    return Object.keys((this.draft() as object) ?? {});
  }

  protected colorEntries(mode: string): { name: string; value: string }[] {
    const group = (this.draft() as Record<string, Record<string, string>>)[mode] ?? {};
    return Object.entries(group).map(([name, value]) => ({ name, value: expandHex(value) }));
  }

  protected setColor(mode: string, name: string, value: string): void {
    const map = this.draft() as Record<string, Record<string, string>>;
    this.draft.set({ ...map, [mode]: { ...map[mode], [name]: value.toUpperCase() } });
  }

  protected async save(row: SettingRow): Promise<void> {
    let value = this.draft();
    if (this.draftKind() === 'json') {
      try {
        value = JSON.parse(this.jsonDraft());
      } catch {
        this.toast.show('invalidJson', 'error');
        return;
      }
    }

    this.saving.set(true);
    try {
      await this.crud.update('app_settings', row.key, { value, visibility: this.visibility() });
      await this.config.load();
      this.theme.apply();
      this.pwa.apply();
      this.editing.set(null);
      this.toast.show('saved', 'success');
      await this.load();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}

/** <input type="color"> needs #rrggbb. */
function expandHex(hex: string): string {
  if (/^#[0-9a-f]{3}$/i.test(hex)) return '#' + [...hex.slice(1)].map((c) => c + c).join('');
  return hex.slice(0, 7);
}
