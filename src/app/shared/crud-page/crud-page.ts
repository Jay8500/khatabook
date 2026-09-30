import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { Row } from '../../core/types/models';
import { DataGrid } from '../data-grid/data-grid';
import { EntityForm } from '../entity-form/entity-form';
import { ENTITIES } from '../entities';
import { EntityConfig, OptionMap, primaryKey } from '../entity';

/** List + add/edit/delete for any entity in ENTITIES. Route data: { entity: '<name>' }. */
@Component({
  selector: 'app-crud-page',
  imports: [DataGrid, EntityForm],
  template: `
    @if (def(); as def) {
      <div class="mb-4">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-xl font-bold sm:text-2xl">{{ config.label(def.labelPrefix + '.title') }}</h1>
          <div class="flex shrink-0 gap-2">
            @if (def.action; as action) {
              <button
                type="button"
                class="rounded-xl border border-primary px-4 py-2.5 text-sm font-medium hover:bg-primary hover:text-on-primary disabled:opacity-50"
                [disabled]="running()"
                (click)="runAction(action.rpc)"
              >
                {{ config.label(running() ? 'common.loading' : action.label) }}
              </button>
            }
            @if (def.create !== false) {
              <button type="button" class="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-on-primary hover:opacity-90" (click)="open(null)">
                + {{ config.label('common.add') }}
              </button>
            }
          </div>
        </div>
        @if (config.hasLabel(def.labelPrefix + '.hint')) {
          <p class="mt-1 max-w-prose text-sm text-muted">{{ config.label(def.labelPrefix + '.hint') }}</p>
        }
      </div>

      <app-data-grid
        [fields]="def.fields"
        [rows]="rows()"
        [labelPrefix]="def.labelPrefix"
        [options]="options()"
        [loading]="loading()"
        [editable]="def.edit !== false"
        [removable]="def.remove !== false"
        [groupBy]="def.groupBy"
        (edit)="open($event)"
        (remove)="remove($event)"
      />

      @if (editing(); as state) {
        <app-entity-form
          [fields]="def.fields"
          [labelPrefix]="def.labelPrefix"
          [value]="state.row"
          [options]="options()"
          [busy]="saving()"
          (save)="save($event)"
          (cancel)="editing.set(null)"
        />
      }
    }
  `,
})
export class CrudPage {
  protected readonly config = inject(ConfigService);
  private readonly crud = inject(CrudService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly supabase = inject(SupabaseService);

  /** Bound from route data. */
  readonly entity = input.required<string>();

  protected readonly def = computed<EntityConfig | undefined>(() => ENTITIES[this.entity()]);
  protected readonly rows = signal<Row[]>([]);
  protected readonly options = signal<OptionMap>({});
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly running = signal(false);
  protected readonly editing = signal<{ row: Row | null } | null>(null);

  constructor() {
    effect(() => {
      const def = this.def();
      if (def) void this.load(def);
    });
  }

  private scopeFilter(def: EntityConfig): Row {
    if (def.scope === 'shop') return { shop_id: this.auth.shop()?.id ?? null };
    if (def.scope === 'user') return { user_id: this.auth.profile()?.id ?? null };
    return {};
  }

  private newRowDefaults(def: EntityConfig): Row {
    if (def.scope === 'shop' || def.scope === 'user') return { shop_id: this.auth.shop()?.id ?? null };
    return {};
  }

  private async load(def: EntityConfig): Promise<void> {
    this.loading.set(true);
    try {
      const ctx = { crud: this.crud, config: this.config, auth: this.auth };
      const [rows, ...optionLists] = await Promise.all([
        this.crud.list(def.table, this.scopeFilter(def), def.order),
        ...def.fields.map((f) => (f.options ? Promise.resolve(f.options(ctx)) : Promise.resolve(null))),
      ]);
      const options: OptionMap = {};
      def.fields.forEach((f, i) => {
        if (optionLists[i]) options[f.key] = optionLists[i]!;
      });
      this.options.set(options);
      this.rows.set(rows);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Runs the page's action RPC (returns a count) and reloads. */
  protected async runAction(rpc: string): Promise<void> {
    this.running.set(true);
    try {
      const count = await this.supabase.callSecureRpc<number>(rpc);
      if (count > 0) this.toast.show('remindersChecked', 'success', { count });
      else this.toast.show('noNewReminders', 'info');
      await this.load(this.def()!);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.running.set(false);
    }
  }

  protected open(row: Row | null): void {
    this.editing.set({ row });
  }

  protected async save(values: Row): Promise<void> {
    const def = this.def()!;
    const current = this.editing()?.row;
    const pk = primaryKey(def);

    this.saving.set(true);
    try {
      if (current) {
        const { [pk]: _pk, ...changes } = values;
        await this.crud.update(def.table, String(current[pk]), changes);
      } else {
        await this.crud.upsert(def.table, { ...values, ...this.newRowDefaults(def) });
      }
      this.editing.set(null);
      this.toast.show('saved', 'success');
      if (def.table === 'app_settings') await this.config.load();
      await this.load(def);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: Row): Promise<void> {
    const def = this.def()!;
    if (!confirm(this.config.label('common.confirmDelete'))) return;
    try {
      await this.crud.remove(def.table, String(row[primaryKey(def)]));
      this.toast.show('deleted', 'success');
      await this.load(def);
    } catch (err) {
      this.toast.error(err);
    }
  }
}
