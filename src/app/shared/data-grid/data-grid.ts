import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { Row } from '../../core/types/models';
import { FieldDef, OptionMap, displayValue } from '../entity';

/** Searchable grid: a table from md up, stacked cards on phones. */
@Component({
  selector: 'app-data-grid',
  template: `
    <div class="mb-3">
      <input
        type="search"
        class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        [placeholder]="config.label('common.search')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
    </div>

    @if (loading()) {
      <p class="py-10 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    } @else if (filtered().length === 0) {
      <p class="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted">
        {{ config.label('common.empty') }}
      </p>
    } @else {
      <!-- Desktop -->
      <div class="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
        <table class="w-full text-left text-sm">
          <thead class="bg-background text-xs uppercase tracking-wide text-muted">
            <tr>
              @for (col of columns(); track col.key) {
                <th class="px-4 py-3 font-medium">{{ config.label(labelPrefix() + '.' + col.key) }}</th>
              }
              @if (actions()) {
                <th class="px-4 py-3 text-right font-medium">{{ config.label('common.actions') }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (group of groups(); track group.key) {
              @if (groupBy()) {
                <tr class="border-t border-border bg-background/70">
                  <td [attr.colspan]="columns().length + (actions() ? 1 : 0)" class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {{ group.key || config.label('common.uncategorised') }} <span class="font-normal">({{ group.rows.length }})</span>
                  </td>
                </tr>
              }
            @for (row of group.rows; track $index) {
              <tr class="border-t border-border hover:bg-background/60">
                @for (col of columns(); track col.key) {
                  <td class="max-w-52 truncate px-4 py-3" [title]="cell(col, row)">{{ cell(col, row) }}</td>
                }
                @if (actions()) {
                  <td class="whitespace-nowrap px-4 py-3 text-right">
                    <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: row }" />
                  </td>
                }
              </tr>
            }
            }
          </tbody>
        </table>
      </div>

      <!-- Phone -->
      <ul class="grid grid-cols-1 gap-3 md:hidden">
        @for (group of groups(); track group.key) {
          @if (groupBy()) {
            <li class="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0">
              {{ group.key || config.label('common.uncategorised') }} <span class="font-normal">({{ group.rows.length }})</span>
            </li>
          }
        @for (row of group.rows; track $index) {
          <li class="min-w-0 rounded-2xl border border-border bg-surface p-4">
            <dl class="grid gap-2">
              @for (col of columns(); track col.key) {
                <div class="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <dt class="shrink-0 text-muted">{{ config.label(labelPrefix() + '.' + col.key) }}</dt>
                  <dd class="line-clamp-3 min-w-0 text-right font-medium wrap-anywhere">{{ cell(col, row) }}</dd>
                </div>
              }
            </dl>
            @if (actions()) {
              <div class="mt-3 flex justify-end gap-2 border-t border-border pt-3">
                <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: row }" />
              </div>
            }
          </li>
        }
        }
      </ul>
    }

    <ng-template #rowActions let-row>
      @if (editable()) {
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-medium text-info hover:bg-info/10" (click)="edit.emit(row)">
          {{ config.label('common.edit') }}
        </button>
      }
      @if (removable()) {
        <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-medium text-error hover:bg-error/10" (click)="remove.emit(row)">
          {{ config.label('common.delete') }}
        </button>
      }
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class DataGrid {
  protected readonly config = inject(ConfigService);

  readonly fields = input.required<FieldDef[]>();
  readonly rows = input.required<Row[]>();
  readonly labelPrefix = input.required<string>();
  readonly options = input<OptionMap>({});
  readonly loading = input(false);
  readonly editable = input(true);
  readonly removable = input(true);
  /** Column to group rows under headings (e.g. category); rows are expected sorted by it. */
  readonly groupBy = input<string | undefined>(undefined);

  readonly edit = output<Row>();
  readonly remove = output<Row>();

  protected readonly query = signal('');
  protected readonly columns = computed(() => this.fields().filter((f) => f.grid !== false));
  protected readonly actions = computed(() => this.editable() || this.removable());
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter((row) =>
      this.columns().some((col) => this.cell(col, row).toLowerCase().includes(q)),
    );
  });

  protected readonly groups = computed(() => {
    const key = this.groupBy();
    if (!key) return [{ key: '', rows: this.filtered() }];
    const map = new Map<string, Row[]>();
    for (const row of this.filtered()) {
      const k = String(row[key] ?? '').trim();
      map.set(k, [...(map.get(k) ?? []), row]);
    }
    // Named groups A-Z, uncategorised last.
    return [...map.entries()]
      .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
      .map(([k, rows]) => ({ key: k, rows }));
  });

  protected cell(field: FieldDef, row: Row): string {
    return displayValue(field, row, this.options(), this.config);
  }
}

