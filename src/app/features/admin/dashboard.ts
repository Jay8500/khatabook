import { Component, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { Avatar } from '../../shared/avatar/avatar';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';
type Bucket = 'day' | 'week' | 'month' | 'year';

interface Totals {
  shops: number;
  active: number;
  expired: number;
  paused: number;
  closing: number;
  closed: number;
  new_shops: number;
  revenue: number;
  payments: number;
  sales: number;
  orders: number;
  customers: number;
}

interface Point {
  bucket: string;
  revenue: number;
  sales: number;
}

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  closed_at: string | null;
  state: 'open' | 'closing' | 'paused' | 'closed';
  plan_price: number | null;
  payments_list: Payment[];
  subscription_expires_at: string | null;
  created_at: string;
  plan: string | null;
  owner_phone: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
  customers: number;
  orders: number;
  sales: number;
  last_order_at: string | null;
  paid_total: number;
}

interface Payment {
  paid_at: string;
  amount: number;
  plan: string | null;
  valid_from: string | null;
  valid_until: string | null;
  note: string | null;
}

interface ClosureRequest {
  id: string;
  shop_id: string;
  shop: string;
  reason: string | null;
  created_at: string;
  owner_phone: string | null;
  owner_name: string | null;
  open_orders: number;
  paid_total: number;
  valid_till: string | null;
}

type Status = 'active' | 'expired' | 'paused' | 'closing' | 'closed';
type PlanFilter = 'all' | 'trial' | 'paid' | 'none';

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
}

const PERIODS: Period[] = ['today', 'week', 'month', 'year', 'all'];
const PLAN_FILTERS: PlanFilter[] = ['all', 'trial', 'paid', 'none'];
const STATUS_CLASS: Record<Status, string> = {
  active: 'bg-success/15 text-success',
  expired: 'bg-warning/15 text-warning',
  paused: 'bg-muted/15 text-muted',
  closing: 'bg-warning/15 text-warning',
  closed: 'bg-error/15 text-error',
};
const STATUS_DOT: Record<Status, string> = {
  active: 'bg-success',
  expired: 'bg-warning',
  paused: 'bg-muted',
  closing: 'bg-warning',
  closed: 'bg-error',
};

/** Platform admin: shops (your customers), subscription revenue and shop sales by period. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [Avatar],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('dash.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ config.label('dash.hint') }}</p>

    <!-- Period filter -->
    <div class="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
      @for (p of periods; track p) {
        <button
          type="button"
          class="shrink-0 rounded-full border px-4 py-2 text-sm font-medium"
          [class]="period() === p ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'"
          (click)="setPeriod(p)"
        >
          {{ config.label('dash.period.' + p) }}
        </button>
      }
    </div>

    <!-- Shop closure requests: settle money, then approve -->
    @if (requests().length) {
      <section class="mt-4 rounded-2xl border-2 border-warning/50 bg-warning/5 p-4">
        <h2 class="font-semibold">{{ config.label('dash.closureRequests', { count: requests().length }) }}</h2>
        <p class="text-xs text-muted">{{ config.label('dash.closureHint') }}</p>
        <ul class="mt-3 grid gap-2">
          @for (r of requests(); track r.id) {
            <li class="rounded-xl border border-border bg-surface p-3 text-sm">
              <p class="font-semibold">{{ r.shop }}</p>
              <p class="text-xs text-muted">{{ r.owner_name }} · {{ phone(r.owner_phone) }} · {{ day(r.created_at) }}</p>
              @if (r.reason) {
                <p class="mt-2 rounded-lg bg-background px-3 py-2">“{{ r.reason }}”</p>
              }
              <p class="mt-2 text-xs">
                {{ config.label('dash.openOrders', { count: r.open_orders }) }} · {{ config.label('dash.col.paid') }} {{ config.money(r.paid_total) }}
                @if (r.valid_till) { · {{ config.label('dash.validTill', { date: day(r.valid_till) }) }} }
              </p>
              <input
                [class]="inputClass + ' mt-2 text-sm'"
                [placeholder]="config.label('dash.decisionNote')"
                [value]="decisionNotes()[r.id] ?? ''"
                (input)="setDecisionNote(r.id, $any($event.target).value)"
              />
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button type="button" class="rounded-xl border border-border px-3 py-2 font-medium disabled:opacity-50" [disabled]="busy()" (click)="decide(r, false)">{{ config.label('dash.rejectClosure') }}</button>
                <button type="button" class="rounded-xl bg-error px-3 py-2 font-semibold text-white disabled:opacity-50" [disabled]="busy()" (click)="decide(r, true)">{{ config.label('dash.approveClosure') }}</button>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    @if (totals(); as t) {
      <!-- Headline numbers -->
      <section class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div class="rounded-2xl bg-primary p-4 text-on-primary">
          <p class="text-xs opacity-90">{{ config.label('dash.revenue') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ config.money(t.revenue) }}</p>
          <p class="text-xs opacity-90">{{ config.label('dash.payments', { count: t.payments }) }}</p>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-4">
          <p class="text-xs text-muted">{{ config.label('dash.sales') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ config.money(t.sales) }}</p>
          <p class="text-xs text-muted">{{ config.label('dash.orders', { count: t.orders }) }}</p>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-4">
          <p class="text-xs text-muted">{{ config.label('dash.shops') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ t.shops }}</p>
          <p class="text-xs text-muted">{{ config.label('dash.newShops', { count: t.new_shops }) }}</p>
        </div>
        <div class="rounded-2xl border border-border bg-surface p-4">
          <p class="text-xs text-muted">{{ config.label('dash.endCustomers') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ t.customers }}</p>
          <p class="text-xs text-muted">{{ config.label('dash.endCustomersHint') }}</p>
        </div>
      </section>

      <!-- Shop status -->
      <section class="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
        @for (s of statusTiles(); track s.key) {
          <button
            type="button"
            class="rounded-2xl border bg-surface p-3"
            [class]="statusFilter() === s.key ? 'border-primary ring-2 ring-primary/30' : 'border-border'"
            (click)="statusFilter.set(statusFilter() === s.key ? '' : s.key)"
          >
            <p class="text-xl font-bold tabular-nums">{{ s.value }}</p>
            <p class="mt-0.5 flex items-center justify-center gap-1 text-xs font-medium">
              <span class="size-2 rounded-full" [class]="s.dot"></span>{{ config.label('dash.status.' + s.key) }}
            </p>
          </button>
        }
      </section>

      <!-- Two charts: different scales never share an axis -->
      <section class="mt-4 grid gap-3 lg:grid-cols-2">
        @for (chart of charts(); track chart.key) {
          <figure class="rounded-2xl border border-border bg-surface p-4">
            <figcaption class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-semibold">{{ config.label('dash.chart.' + chart.key) }}</span>
              <span class="text-xs text-muted">{{ config.label('dash.by.' + bucket()) }}</span>
            </figcaption>
            @if (chart.max === 0) {
              <p class="grid h-36 place-items-center text-sm text-muted">{{ config.label('dash.noData') }}</p>
            } @else {
              <div class="relative mt-3 h-36" role="img" [attr.aria-label]="chart.aria">
                <!-- recessive gridlines -->
                <div class="absolute inset-x-0 top-0 border-t border-dashed border-border"></div>
                <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-border"></div>
                <span class="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-muted">{{ config.money(chart.max) }}</span>
                <div class="absolute inset-0 flex items-end gap-0.5 border-b border-border">
                  @for (bar of chart.bars; track bar.bucket) {
                    <div class="group relative flex h-full flex-1 items-end justify-center" tabindex="0">
                      <div
                        class="w-full max-w-7 rounded-t bg-primary transition-opacity group-hover:opacity-80"
                        [style.height.%]="bar.pct"
                        [style.min-height.px]="bar.value > 0 ? 2 : 0"
                      ></div>
                      <!-- tooltip -->
                      <div class="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-lg group-hover:block group-focus:block">
                        <b class="tabular-nums">{{ config.money(bar.value) }}</b>
                        <span class="block text-muted">{{ bar.label }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
              <div class="mt-1 flex justify-between text-[10px] text-muted">
                <span>{{ chart.bars[0]?.label }}</span><span>{{ chart.bars[chart.bars.length - 1]?.label }}</span>
              </div>
            }
          </figure>
        }
      </section>

      <!-- Shops (also the table view of the numbers above) -->
      <section class="mt-5">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">{{ config.label('dash.shopList') }} ({{ shops().length }})</h2>
          <input
            type="search"
            class="w-44 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-64"
            [placeholder]="config.label('dash.searchPlaceholder')"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </div>
        <div class="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          @for (f of planFilters; track f) {
            <button
              type="button"
              class="shrink-0 rounded-full border px-3 py-1 text-xs font-medium"
              [class]="planFilter() === f ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'"
              (click)="planFilter.set(f)"
            >
              {{ config.label('dash.planFilter.' + f) }}
            </button>
          }
        </div>
        <button type="button" class="mt-2 text-xs font-medium text-primary" (click)="showHelp.set(!showHelp())">
          ⓘ {{ config.label(showHelp() ? 'dash.help.hide' : 'dash.help.show') }}
        </button>
        @if (showHelp()) {
          <dl class="mt-2 grid gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
            @for (k of helpKeys; track k) {
              <div>
                <dt class="font-semibold">{{ config.label('dash.help.' + k + '.title') }}</dt>
                <dd class="text-muted">{{ config.label('dash.help.' + k) }}</dd>
              </div>
            }
          </dl>
        }
        <ul class="mt-2 grid gap-2 lg:grid-cols-2">
          @for (s of shops(); track s.id) {
            @let st = status(s);
            <li class="min-w-0 rounded-2xl border border-border bg-surface p-4" [class.opacity-70]="st === 'closed'">
              <div class="flex items-center gap-3">
                <app-avatar [url]="s.owner_avatar" [name]="s.owner_name || s.name" [size]="44" />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ s.name }}</p>
                  <p class="truncate text-xs text-muted">{{ s.owner_name }} · {{ phone(s.owner_phone) }}</p>
                </div>
                <span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="statusClass(st)">{{ config.label('dash.status.' + st) }}</span>
              </div>
              <dl class="mt-3 grid grid-cols-4 gap-1 text-center text-xs">
                <div><dt class="text-muted">{{ config.label('dash.col.customers') }}</dt><dd class="font-semibold tabular-nums">{{ s.customers }}</dd></div>
                <div><dt class="text-muted">{{ config.label('dash.col.orders') }}</dt><dd class="font-semibold tabular-nums">{{ s.orders }}</dd></div>
                <div><dt class="text-muted">{{ config.label('dash.col.sales') }}</dt><dd class="font-semibold tabular-nums">{{ config.money(s.sales) }}</dd></div>
                <div><dt class="text-muted">{{ config.label('dash.col.paid') }}</dt><dd class="font-semibold tabular-nums">{{ config.money(s.paid_total) }}</dd></div>
              </dl>
              <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-background px-3 py-2.5 text-xs">
                <div class="flex min-w-0 items-center justify-between gap-2">
                  <dt class="text-muted">{{ config.label('dash.meta.plan') }}</dt>
                  <dd class="flex min-w-0 items-center gap-1 font-medium">
                    @if (s.plan) {
                      <span class="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold" [class]="+(s.plan_price ?? 0) > 0 ? 'bg-primary/10 text-primary' : 'bg-info/15 text-info'">
                        {{ config.label(+(s.plan_price ?? 0) > 0 ? 'dash.planFilter.paid' : 'dash.planFilter.trial') }}
                      </span>
                    }
                    <span class="truncate">{{ s.plan || config.label('dash.noPlan') }}</span>
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <dt class="text-muted">{{ config.label('dash.meta.validTill') }}</dt>
                  <dd class="font-medium tabular-nums" [class.text-error]="st === 'expired'">{{ day(s.subscription_expires_at) }}</dd>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <dt class="text-muted">{{ config.label('dash.meta.lastOrder') }}</dt>
                  <dd class="font-medium tabular-nums">{{ day(s.last_order_at) }}</dd>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <dt class="text-muted">{{ config.label(s.closed_at ? 'dash.meta.closed' : 'dash.meta.joined') }}</dt>
                  <dd class="font-medium tabular-nums">{{ day(s.closed_at ?? s.created_at) }}</dd>
                </div>
              </dl>
              @if (s.payments_list.length) {
                <button type="button" class="mt-2 text-xs font-medium text-primary" (click)="toggleHistory(s.id)">
                  {{ config.label(openHistory() === s.id ? 'dash.hidePayments' : 'dash.showPayments', { count: s.payments_list.length }) }}
                </button>
                @if (openHistory() === s.id) {
                  <ul class="mt-2 grid gap-1 rounded-xl bg-background p-2 text-xs">
                    @for (p of s.payments_list; track $index) {
                      <li class="flex justify-between gap-2">
                        <span class="min-w-0 truncate">
                          {{ day(p.paid_at) }} · {{ p.plan }}
                          @if (p.valid_until) { → {{ day(p.valid_until) }} }
                          @if (p.note) { · {{ p.note }} }
                        </span>
                        <b class="shrink-0 tabular-nums">{{ config.money(p.amount) }}</b>
                      </li>
                    }
                  </ul>
                }
              }
              <div class="mt-3 grid gap-2 border-t border-border pt-3 text-sm" [class]="s.state === 'closed' ? 'grid-cols-2' : 'grid-cols-3'">
                <button type="button" class="flex items-center justify-center rounded-xl bg-primary px-2 py-2 text-center leading-tight font-semibold text-on-primary" (click)="openPayment(s)">{{ config.label('dash.recordPayment') }}</button>
                <a [href]="'/s/' + s.slug" target="_blank" rel="noopener" class="flex items-center justify-center rounded-xl border border-border px-2 py-2 text-center leading-tight font-medium">{{ config.label('dash.openStore') }}</a>
                @if (s.state !== 'closed') {
                  <button type="button" class="flex items-center justify-center rounded-xl border px-2 py-2 text-center leading-tight font-medium" [class]="s.is_active ? 'border-error/40 text-error' : 'border-success/40 text-success'" (click)="toggleActive(s)">
                    {{ config.label(s.is_active ? 'dash.deactivate' : 'dash.activate') }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      </section>
    } @else {
      <p class="py-16 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    }

    <!-- Record payment -->
    @if (paying(); as s) {
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" (click)="paying.set(null)">
        <form
          class="w-full rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-3xl sm:p-6"
          (click)="$event.stopPropagation()"
          (submit)="$event.preventDefault(); savePayment(s)"
        >
          <h2 class="text-lg font-semibold">{{ config.label('dash.recordPayment') }}</h2>
          <p class="text-sm text-muted">{{ s.name }}</p>
          <label class="mt-4 grid gap-1.5 text-sm">
            <span class="font-medium">{{ config.label('dash.plan') }}</span>
            <select [class]="inputClass" (change)="pickPlan($any($event.target).value)">
              @for (p of plans(); track p.id) {
                <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ config.money(p.price) }} · {{ config.label('dash.days', { count: p.duration_days }) }}</option>
              }
            </select>
          </label>
          <label class="mt-3 grid gap-1.5 text-sm">
            <span class="font-medium">{{ config.label('dash.amount') }}</span>
            <input type="number" min="0" [class]="inputClass" [value]="amount()" (input)="amount.set(+$any($event.target).value)" />
          </label>
          <label class="mt-3 grid gap-1.5 text-sm">
            <span class="font-medium">{{ config.label('dash.note') }}</span>
            <input [class]="inputClass" [placeholder]="config.label('dash.notePlaceholder')" [value]="note()" (input)="note.set($any($event.target).value)" />
          </label>
          <p class="mt-3 text-xs text-muted">{{ config.label('dash.extendHint') }}</p>
          <div class="mt-5 flex gap-3">
            <button type="button" class="flex-1 rounded-xl border border-border px-4 py-3 font-medium" (click)="paying.set(null)">{{ config.label('common.cancel') }}</button>
            <button type="submit" class="flex-1 rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || !planId()">{{ config.label('common.save') }}</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class AdminDashboard {
  protected readonly config = inject(ConfigService);
  private readonly supabase = inject(SupabaseService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly periods = PERIODS;
  protected readonly planFilters = PLAN_FILTERS;
  protected readonly inputClass =
    'w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary';

  protected readonly period = signal<Period>('month');
  protected readonly bucket = signal<Bucket>('day');
  protected readonly totals = signal<Totals | null>(null);
  private readonly series = signal<Point[]>([]);
  private readonly allShops = signal<ShopRow[]>([]);
  protected readonly query = signal('');
  protected readonly statusFilter = signal('');
  protected readonly planFilter = signal<PlanFilter>('all');
  protected readonly requests = signal<ClosureRequest[]>([]);
  protected readonly decisionNotes = signal<Record<string, string>>({});
  protected readonly openHistory = signal('');
  protected readonly showHelp = signal(false);
  protected readonly helpKeys = ['recordPayment', 'store', 'deactivate', 'closed'];
  protected readonly plans = signal<Plan[]>([]);
  protected readonly paying = signal<ShopRow | null>(null);
  protected readonly planId = signal('');
  protected readonly amount = signal(0);
  protected readonly note = signal('');
  protected readonly busy = signal(false);

  protected readonly statusTiles = computed(() => {
    const t = this.totals();
    return (['active', 'expired', 'paused', 'closing', 'closed'] as Status[]).map((key) => ({
      key,
      value: t?.[key] ?? 0,
      dot: STATUS_DOT[key],
    }));
  });

  protected readonly shops = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.statusFilter();
    const plan = this.planFilter();
    return this.allShops().filter(
      (s) =>
        (!f || this.status(s) === f) &&
        (plan === 'all' || this.planKind(s) === plan) &&
        (!q || `${s.name} ${s.slug} ${s.owner_name ?? ''} ${s.owner_phone ?? ''}`.toLowerCase().includes(q)),
    );
  });

  protected readonly charts = computed(() =>
    (['revenue', 'sales'] as const).map((key) => {
      const bars = this.series().map((p) => ({ bucket: p.bucket, value: +p[key], label: this.bucketLabel(p.bucket) }));
      const max = Math.max(0, ...bars.map((b) => b.value));
      return {
        key,
        max,
        aria: bars.map((b) => `${b.label}: ${this.config.money(b.value)}`).join(', '),
        bars: bars.map((b) => ({ ...b, pct: max ? (b.value / max) * 100 : 0 })),
      };
    }),
  );

  constructor() {
    void this.load();
    void this.loadPlans();
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    void this.load();
  }

  /** Period -> [from, to) and a sensible bar size. */
  private range(): { from: Date; to: Date; bucket: Bucket } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(start.getTime() + 86_400_000);
    switch (this.period()) {
      case 'today':
        return { from: start, to, bucket: 'day' };
      case 'week': {
        const monday = new Date(start);
        monday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        return { from: monday, to, bucket: 'day' };
      }
      case 'month':
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to, bucket: 'day' };
      case 'year':
        return { from: new Date(now.getFullYear(), 0, 1), to, bucket: 'month' };
      default:
        return { from: new Date(2000, 0, 1), to, bucket: 'month' };
    }
  }

  private async load(): Promise<void> {
    const { from, to, bucket } = this.range();
    this.bucket.set(bucket);
    try {
      const data = await this.supabase.callSecureRpc<{
        totals: Totals;
        series: Point[];
        shops: ShopRow[];
        closure_requests: ClosureRequest[];
      }>(
        'admin_dashboard',
        { p_from: from.toISOString(), p_to: to.toISOString(), p_bucket: bucket },
      );
      this.totals.set(data.totals);
      this.series.set(data.series);
      this.allShops.set(data.shops);
      this.requests.set(data.closure_requests ?? []);
    } catch (err) {
      this.toast.error(err);
    }
  }

  private async loadPlans(): Promise<void> {
    try {
      this.plans.set(await this.crud.list<Plan>('pricing_plans', { is_active: true }, 'sort_order'));
    } catch {
      // Plans are only needed for the payment form.
    }
  }

  protected status(s: ShopRow): Status {
    if (s.state !== 'open') return s.state;
    if (s.subscription_expires_at && new Date(s.subscription_expires_at) <= new Date()) return 'expired';
    return 'active';
  }

  protected statusClass(st: Status): string {
    return STATUS_CLASS[st];
  }

  /** Trial = a free plan, paid = a priced plan, none = never given a plan. */
  private planKind(s: ShopRow): PlanFilter {
    if (!s.plan) return 'none';
    return +(s.plan_price ?? 0) > 0 ? 'paid' : 'trial';
  }

  protected toggleHistory(id: string): void {
    this.openHistory.set(this.openHistory() === id ? '' : id);
  }

  protected setDecisionNote(id: string, note: string): void {
    this.decisionNotes.update((n) => ({ ...n, [id]: note }));
  }

  /** Approve closes the shop end to end (open orders cancelled, store off); reject keeps it running. */
  protected async decide(r: ClosureRequest, approve: boolean): Promise<void> {
    const key = approve ? 'dash.confirmApproveClosure' : 'dash.confirmRejectClosure';
    if (!confirm(this.config.label(key, { shop: r.shop, count: r.open_orders }))) return;
    this.busy.set(true);
    try {
      await this.supabase.callSecureRpc('decide_shop_closure', {
        p_request_id: r.id,
        p_approve: approve,
        p_note: this.decisionNotes()[r.id] ?? '',
      });
      this.toast.show(approve ? 'closureApproved' : 'closureRejected', 'success', { shop: r.shop });
      await this.load();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  /** Same short date everywhere on the card; a dash when empty. */
  protected day(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString(this.config.get<string>('LOCALE'), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  protected phone(p: string | null): string {
    return p ? `+${p}` : '';
  }

  private bucketLabel(iso: string): string {
    const d = new Date(iso);
    const locale = this.config.get<string>('LOCALE');
    if (this.bucket() === 'month') return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    if (this.bucket() === 'year') return String(d.getFullYear());
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }

  protected openPayment(s: ShopRow): void {
    const plan = this.plans().find((p) => p.name === s.plan) ?? this.plans()[0];
    this.planId.set(plan?.id ?? '');
    this.amount.set(+(plan?.price ?? 0));
    this.note.set('');
    this.paying.set(s);
  }

  protected pickPlan(id: string): void {
    this.planId.set(id);
    this.amount.set(+(this.plans().find((p) => p.id === id)?.price ?? 0));
  }

  protected async savePayment(s: ShopRow): Promise<void> {
    this.busy.set(true);
    try {
      await this.supabase.callSecureRpc('record_subscription_payment', {
        p_shop_id: s.id,
        p_plan_id: this.planId(),
        p_amount: this.amount(),
        p_note: this.note(),
      });
      this.paying.set(null);
      this.toast.show('paymentRecorded', 'success', { shop: s.name });
      await this.load();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleActive(s: ShopRow): Promise<void> {
    const confirmKey = s.is_active ? 'dash.confirmDeactivate' : 'dash.confirmActivate';
    if (!confirm(this.config.label(confirmKey, { shop: s.name }))) return;
    try {
      await this.supabase.callSecureRpc('set_shop_active', { p_shop_id: s.id, p_active: !s.is_active });
      this.toast.show(s.is_active ? 'shopDeactivated' : 'shopActivated', 'success', { shop: s.name });
      await this.load();
    } catch (err) {
      this.toast.error(err);
    }
  }
}
