import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';
import { Row } from '../../core/types/models';
import { FieldDef, OptionMap } from '../entity';

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
                    @for (opt of options()[field.key] ?? []; track opt.value) {
                      <option [value]="opt.value" [selected]="opt.value === draft()[field.key]">{{ opt.label }}</option>
                    }
                  </select>
                }
                @case ('textarea') {
                  <textarea rows="3" [class]="inputClass" [value]="draft()[field.key]" (input)="set(field.key, $any($event.target).value)"></textarea>
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
      const row = this.value() ?? {};
      const draft: Draft = {};
      for (const field of this.formFields()) {
        const v = row[field.key];
        if (field.type === 'boolean') draft[field.key] = v === true;
        else if (field.type === 'json') draft[field.key] = v === undefined ? '' : JSON.stringify(v, null, 2);
        else draft[field.key] = v === null || v === undefined ? '' : String(v);
      }
      this.draft.set(draft);
    });
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
      } else if (field.type === 'json') {
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
