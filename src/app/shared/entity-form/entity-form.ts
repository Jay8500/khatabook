import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { ImageRules, checkImage, compressImage } from '../image';
import { Row } from '../../core/types/models';
import { FieldDef, Option, OptionMap, permissionLabel } from '../entity';
import { CrudService } from '../../core/services/crud.service';

type Draft = Record<string, string | boolean>;

/** Modal form generated from field definitions. Emits the typed row on save. */
@Component({
  selector: 'app-entity-form',
  template: `
    <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" (click)="cancel.emit()">
      <form
        class="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg sm:rounded-3xl sm:p-6"
        (click)="$event.stopPropagation()"
        (submit)="$event.preventDefault(); submit()"
      >
        <h2 class="mb-4 text-lg font-semibold">{{ title() }}</h2>

        <div class="grid gap-4">
          @for (field of formFields(); track field.key) {
            @if (field.type === 'permissions') {
              <div class="grid gap-1.5 text-sm">
                <span class="font-medium">{{ config.label(labelPrefix() + '.' + field.key) }}</span>
                <ul class="divide-y divide-border rounded-xl border border-border bg-background">
                  @for (key of permissionKeys(field); track key) {
                    <li>
                      <label class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                        <span class="min-w-0">
                          <span class="block font-medium">{{ permLabel(key) }}</span>
                          @if (config.hasLabel('perm.' + key + '.hint')) {
                            <span class="block text-xs text-muted">{{ config.label('perm.' + key + '.hint') }}</span>
                          }
                        </span>
                        <input type="checkbox" class="peer sr-only" [checked]="permissionOn(field, key)" (change)="togglePermission(field, key, $any($event.target).checked)" />
                        <span class="relative h-6 w-11 shrink-0 rounded-full bg-border transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"></span>
                      </label>
                    </li>
                  }
                </ul>
              </div>
            } @else if (field.type === 'list') {
              <div class="grid gap-1.5 text-sm">
                <span class="font-medium">{{ config.label(labelPrefix() + '.' + field.key) }}</span>
                @if (listItems(field).length) {
                  <ul class="flex flex-wrap gap-1.5">
                    @for (item of listItems(field); track $index) {
                      <li class="flex items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-primary">
                        {{ item }}
                        <button type="button" class="grid size-5 place-items-center rounded-full hover:bg-primary/20" [attr.aria-label]="config.label('common.delete')" (click)="removeListItem(field, $index)">×</button>
                      </li>
                    }
                  </ul>
                }
                <div class="flex gap-2">
                  <input
                    class="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                    [placeholder]="config.label('form.addItemPlaceholder')"
                    [value]="newOption()[field.key] ?? ''"
                    (input)="setNewOption(field.key, $any($event.target).value)"
                    (keydown.enter)="$event.preventDefault(); addListItem(field)"
                  />
                  <button type="button" class="shrink-0 rounded-xl border border-border px-3 font-medium text-primary disabled:opacity-40" [disabled]="!(newOption()[field.key] ?? '').trim()" (click)="addListItem(field)">
                    + {{ config.label('common.add') }}
                  </button>
                </div>
              </div>
            } @else {
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">
                {{ config.label(labelPrefix() + '.' + field.key) }}
                @if (field.required) { <span class="text-error">*</span> }
              </span>

              @switch (field.type) {
                @case ('boolean') {
                  <input
                    type="checkbox"
                    class="size-5 accent-primary"
                    [checked]="draft()[field.key] === true"
                    (change)="set(field.key, $any($event.target).checked)"
                  />
                }
                @case ('select') {
                  <select
                    [class]="inputClass"
                    [value]="draft()[field.key]"
                    [required]="!!field.required"
                    (change)="set(field.key, $any($event.target).value)"
                  >
                    <option value=""></option>
                    @for (opt of optionsFor(field); track opt.value) {
                      <option [value]="opt.value" [selected]="opt.value === draft()[field.key]">{{ opt.label }}</option>
                    }
                  </select>
                  @if (field.addOption) {
                    <div class="mt-1.5 flex gap-2">
                      <input
                        class="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
                        [placeholder]="config.label('form.addOptionPlaceholder')"
                        [value]="newOption()[field.key] ?? ''"
                        (input)="setNewOption(field.key, $any($event.target).value)"
                        (keydown.enter)="$event.preventDefault(); addOption(field)"
                      />
                      <button type="button" class="shrink-0 rounded-lg border border-border px-3 text-sm font-medium text-primary disabled:opacity-40" [disabled]="!(newOption()[field.key] ?? '').trim()" (click)="addOption(field)">
                        + {{ config.label('common.add') }}
                      </button>
                    </div>
                  }
                }
                @case ('textarea') {
                  <textarea rows="3" [class]="inputClass" [value]="draft()[field.key]" (input)="set(field.key, $any($event.target).value)"></textarea>
                }
                @case ('image') {
                  <div class="flex items-center gap-3">
                    <label class="relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-background">
                      @if (draft()[field.key]) {
                        <img [src]="draft()[field.key]" alt="" class="size-full object-cover" />
                      } @else {
                        <span class="text-2xl text-muted">+</span>
                      }
                      @if (uploading() === field.key) {
                        <span class="absolute inset-0 grid place-items-center bg-black/45"><span class="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white"></span></span>
                      }
                      <input type="file" class="hidden" [accept]="acceptFor(field)" (change)="upload(field, $event)" />
                    </label>
                    @if (draft()[field.key]) {
                      <button type="button" class="text-sm font-medium text-error" (click)="set(field.key, '')">{{ config.label('common.delete') }}</button>
                    }
                  </div>
                }
                @case ('json') {
                  <textarea
                    rows="6"
                    spellcheck="false"
                    [class]="inputClass + ' font-mono text-xs'"
                    [value]="draft()[field.key]"
                    (input)="set(field.key, $any($event.target).value)"
                  ></textarea>
                }
                @default {
                  <input
                    [type]="field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'date' ? 'date' : 'text'"
                    step="any"
                    [class]="inputClass"
                    [value]="draft()[field.key]"
                    [required]="!!field.required"
                    [readOnly]="!!(field.readonlyOnEdit && value())"
                    (input)="set(field.key, $any($event.target).value)"
                  />
                }
              }
            </label>
            }
          }
        </div>

        <div class="mt-6 flex gap-3">
          <button type="button" class="flex-1 rounded-xl border border-border px-4 py-3 font-medium hover:bg-background" (click)="cancel.emit()">
            {{ config.label('common.cancel') }}
          </button>
          <button type="submit" class="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary hover:opacity-90" [disabled]="busy()">
            {{ config.label('common.save') }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class EntityForm {
  protected readonly config = inject(ConfigService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService);
  private readonly crud = inject(CrudService);

  readonly fields = input.required<FieldDef[]>();
  readonly labelPrefix = input.required<string>();
  /** Row being edited, or null for a new row. */
  readonly value = input<Row | null>(null);
  readonly options = input<OptionMap>({});
  readonly busy = input(false);

  readonly save = output<Row>();
  readonly cancel = output<void>();

  protected readonly inputClass =
    'w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary read-only:opacity-60';
  protected readonly draft = signal<Draft>({});
  protected readonly formFields = computed(() => this.fields().filter((f) => f.form !== false));
  protected readonly title = computed(() =>
    this.config.label(this.value() ? 'common.edit' : 'common.add') +
    ' · ' +
    this.config.label(this.labelPrefix() + '.title'),
  );

  constructor() {
    effect(() => {
      const current = this.value();
      const row = current ?? {};
      const draft: Draft = {};
      for (const field of this.formFields()) {
        const v = current ? row[field.key] : field.default;
        if (field.type === 'boolean') draft[field.key] = v === true;
        else if (field.type === 'json') draft[field.key] = v === undefined ? '' : JSON.stringify(v, null, 2);
        else if (field.type === 'permissions') draft[field.key] = JSON.stringify(v ?? {});
        else if (field.type === 'list') draft[field.key] = JSON.stringify(Array.isArray(v) ? v : []);
        else draft[field.key] = v === null || v === undefined ? '' : String(v);
      }
      this.draft.set(draft);
    });
  }

  protected readonly uploading = signal('');
  /** Choices added in this form (shown right away, before options reload). */
  private readonly added = signal<Record<string, Option[]>>({});
  protected readonly newOption = signal<Record<string, string>>({});

  /** Loaded options + ones added here + the row's current value if it is not in the list. */
  protected optionsFor(field: FieldDef): Option[] {
    const list = [...(this.options()[field.key] ?? []), ...(this.added()[field.key] ?? [])];
    const current = String(this.draft()[field.key] ?? '');
    if (current && !list.some((o) => o.value === current)) list.push({ value: current, label: current });
    return list;
  }

  protected setNewOption(key: string, value: string): void {
    this.newOption.update((m) => ({ ...m, [key]: value }));
  }

  protected async addOption(field: FieldDef): Promise<void> {
    const value = (this.newOption()[field.key] ?? '').trim();
    if (!value || !field.addOption) return;
    try {
      await field.addOption({ crud: this.crud, config: this.config, auth: this.auth }, value);
      this.added.update((m) => ({ ...m, [field.key]: [...(m[field.key] ?? []), { value, label: value }] }));
      this.set(field.key, value);
      this.setNewOption(field.key, '');
      this.toast.show('optionAdded', 'success', { value });
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected acceptFor(field: FieldDef): string {
    const rules = field.image ? this.config.get<ImageRules>(field.image.rulesSetting) : undefined;
    return (rules?.types ?? ['image/*']).join(',');
  }

  /** Shrinks and uploads to <bucket>/<shop id>/<random>.jpg, then stores the public URL. */
  protected async upload(field: FieldDef, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const shopId = this.auth.shop()?.id;
    if (!file || !field.image || !shopId) return;
    const rules = this.config.get<ImageRules>(field.image.rulesSetting) ?? {};
    const problem = checkImage(file, rules);
    if (problem) {
      this.toast.show(problem, 'warning', { types: (rules.types ?? []).map((t) => t.split('/')[1]?.toUpperCase()).join(', '), mb: rules.max_mb });
      return;
    }
    const bucket = this.config.get<string>(field.image.bucketSetting);
    if (!bucket) return;
    this.uploading.set(field.key);
    try {
      const blob = await compressImage(file, rules);
      const path = `${shopId}/${crypto.randomUUID()}.jpg`;
      const storage = this.supabase.requireClient().storage.from(bucket);
      const { error } = await storage.upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      this.set(field.key, storage.getPublicUrl(path).data.publicUrl);
    } catch (err) {
      console.error(err);
      this.toast.show('photoFailed', 'error');
    } finally {
      this.uploading.set('');
    }
  }

  // --- permissions: {key: true} object kept as JSON text in the draft --------
  private parsed<T>(field: FieldDef, fallback: T): T {
    try {
      return (JSON.parse(String(this.draft()[field.key] || 'null')) as T) ?? fallback;
    } catch {
      return fallback;
    }
  }

  /** PERMISSIONS setting order, plus any extra key already on the row. */
  protected permissionKeys(field: FieldDef): string[] {
    const known = this.config.get<string[]>('PERMISSIONS') ?? [];
    const extra = Object.keys(this.parsed<Record<string, unknown>>(field, {})).filter((k) => !known.includes(k));
    return [...known, ...extra];
  }

  protected permLabel(key: string): string {
    return permissionLabel(this.config, key);
  }

  protected permissionOn(field: FieldDef, key: string): boolean {
    return this.parsed<Record<string, unknown>>(field, {})[key] === true;
  }

  /** Off removes the key, so saved roles look the same as before. */
  protected togglePermission(field: FieldDef, key: string, on: boolean): void {
    const perms = { ...this.parsed<Record<string, unknown>>(field, {}) };
    if (on) perms[key] = true;
    else delete perms[key];
    this.set(field.key, JSON.stringify(perms));
  }

  // --- list: array of texts kept as JSON text in the draft --------------------
  protected listItems(field: FieldDef): string[] {
    const list = this.parsed<unknown[]>(field, []);
    return Array.isArray(list) ? list.map(String) : [];
  }

  protected addListItem(field: FieldDef): void {
    const value = (this.newOption()[field.key] ?? '').trim();
    if (!value) return;
    this.set(field.key, JSON.stringify([...this.listItems(field), value]));
    this.setNewOption(field.key, '');
  }

  protected removeListItem(field: FieldDef, index: number): void {
    this.set(field.key, JSON.stringify(this.listItems(field).filter((_, i) => i !== index)));
  }

  protected set(key: string, value: string | boolean): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected submit(): void {
    const draft = this.draft();
    const row: Row = {};
    for (const field of this.formFields()) {
      const raw = draft[field.key];
      if (field.type === 'boolean') {
        row[field.key] = raw === true;
        continue;
      }
      const text = String(raw ?? '').trim();
      if (!text) {
        if (field.required) {
          this.toast.show('required', 'warning');
          return;
        }
        row[field.key] = null;
        continue;
      }
      if (field.type === 'number' || field.type === 'money') {
        row[field.key] = Number(text);
      } else if (field.type === 'json' || field.type === 'permissions' || field.type === 'list') {
        try {
          row[field.key] = JSON.parse(text);
        } catch {
          this.toast.show('invalidJson', 'error');
          return;
        }
      } else {
        row[field.key] = text;
      }
    }
    this.save.emit(row);
  }
}
