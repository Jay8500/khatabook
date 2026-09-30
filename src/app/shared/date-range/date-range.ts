import { Component, inject, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

export type RangeKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

/** [from, to) in ISO; null bounds mean open-ended. */
export interface DateRange {
  key: RangeKey;
  from: string | null;
  to: string | null;
}

const KEYS: RangeKey[] = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'all', 'custom'];

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Resolves a preset (or custom from/to dates, both inclusive) to a range. */
export function resolveRange(key: RangeKey, customFrom = '', customTo = ''): DateRange {
  const today = day(new Date());
  const tomorrow = addDays(today, 1);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  switch (key) {
    case 'today':
      return { key, from: iso(today), to: iso(tomorrow) };
    case 'yesterday':
      return { key, from: iso(addDays(today, -1)), to: iso(today) };
    case 'last7':
      return { key, from: iso(addDays(today, -6)), to: iso(tomorrow) };
    case 'last30':
      return { key, from: iso(addDays(today, -29)), to: iso(tomorrow) };
    case 'thisMonth':
      return { key, from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(tomorrow) };
    case 'lastMonth':
      return {
        key,
        from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      };
    case 'custom': {
      const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
      const to = customTo ? addDays(new Date(`${customTo}T00:00:00`), 1) : null;
      return { key, from: iso(from), to: iso(to) };
    }
    default:
      return { key: 'all', from: null, to: null };
  }
}

/** ORDER_DEFAULT_RANGE, or last 30 days. */
export function defaultRangeKey(config: ConfigService): RangeKey {
  const key = config.get<string>('ORDER_DEFAULT_RANGE') ?? '';
  return (KEYS as string[]).includes(key) ? (key as RangeKey) : 'last30';
}

/** Date range dropdown with a custom From / To option; the default comes from ORDER_DEFAULT_RANGE. */
@Component({
  selector: 'app-date-range',
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium outline-none focus:border-primary"
        [attr.aria-label]="config.label('range.label')"
        (change)="pick($any($event.target).value)"
      >
        @for (k of keys; track k) {
          <option [value]="k" [selected]="k === key()">{{ config.label('range.' + k) }}</option>
        }
      </select>
      @if (key() === 'custom') {
        <label class="flex items-center gap-1 text-xs text-muted">
          {{ config.label('range.from') }}
          <input type="date" class="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text" [max]="max" [value]="from()" (change)="setFrom($any($event.target).value)" />
        </label>
        <label class="flex items-center gap-1 text-xs text-muted">
          {{ config.label('range.to') }}
          <input type="date" class="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text" [max]="max" [min]="from()" [value]="to()" (change)="setTo($any($event.target).value)" />
        </label>
      }
    </div>
  `,
})
export class DateRangeFilter {
  protected readonly config = inject(ConfigService);
  readonly changed = output<DateRange>();

  protected readonly keys = KEYS;
  protected readonly max = toInput(new Date());
  protected readonly key = signal<RangeKey>(defaultRangeKey(this.config));
  protected readonly from = signal(toInput(addDays(new Date(), -29)));
  protected readonly to = signal(toInput(new Date()));

  protected pick(key: RangeKey): void {
    this.key.set(key);
    this.emit();
  }

  protected setFrom(v: string): void {
    this.from.set(v);
    this.emit();
  }

  protected setTo(v: string): void {
    this.to.set(v);
    this.emit();
  }

  private emit(): void {
    this.changed.emit(resolveRange(this.key(), this.from(), this.to()));
  }
}
