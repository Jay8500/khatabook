import { Component, DestroyRef, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';
import { Order, OrderStatus } from '../../core/types/store';
import { DateRange, DateRangeFilter, defaultRangeKey, resolveRange } from '../../shared/date-range/date-range';
import { OrderCard } from './order-card';

/** Tabs group statuses; "closed" holds rejected + cancelled. */
const TABS: { key: string; statuses: OrderStatus[] }[] = [
  { key: 'new', statuses: ['requested'] },
  { key: 'accepted', statuses: ['accepted'] },
  { key: 'packed', statuses: ['packed'] },
  { key: 'ready', statuses: ['ready'] },
  { key: 'completed', statuses: ['completed'] },
  { key: 'closed', statuses: ['rejected', 'cancelled'] },
];

/** Shop owner's Orders tab. */
@Component({
  selector: 'app-shop-orders',
  imports: [DateRangeFilter, OrderCard],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('orders.shopTitle') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ config.label('orders.shopHint') }}</p>
    <div class="mt-3"><app-date-range (changed)="setRange($event)" /></div>

    <div class="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
      @for (t of tabs; track t.key) {
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium"
          [class]="tab() === t.key ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'"
          (click)="select(t.key)"
        >
          {{ config.label('orders.tab.' + t.key) }}
          @if (count(t.statuses)) {
            <span class="rounded-full px-1.5 text-xs font-bold" [class]="t.key === 'new' ? 'bg-error text-white' : 'bg-black/10'">{{ count(t.statuses) }}</span>
          }
        </button>
      }
    </div>

    @if (loading()) {
      <p class="py-10 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    } @else if (orders().length === 0) {
      <p class="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">{{ config.label('orders.emptyTab') }}</p>
    } @else {
      <ul class="mt-4 grid gap-2">
        @for (o of orders(); track o.id) {
          <li><app-order-card [order]="o" [who]="customerName(o.customer_id)" /></li>
        }
      </ul>
    }
  `,
})
export class ShopOrders {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly tab = signal('new');
  protected readonly orders = signal<Order[]>([]);
  protected readonly counts = signal<Partial<Record<OrderStatus, number>>>({});
  protected readonly loading = signal(true);
  private readonly customers = signal<Map<string, string>>(new Map());

  constructor() {
    void this.load();
    const seconds = this.config.get<number>('ORDER_POLL_SECONDS') ?? 20;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.load(false);
    }, seconds * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  private range: DateRange = resolveRange(defaultRangeKey(this.config));

  protected setRange(range: DateRange): void {
    this.range = range;
    void this.load();
  }

  protected count(statuses: OrderStatus[]): number {
    const c = this.counts();
    return statuses.reduce((n, s) => n + (c[s] ?? 0), 0);
  }

  protected select(key: string): void {
    this.tab.set(key);
    void this.load();
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) this.loading.set(true);
    try {
      const filter: Record<string, unknown> = { shop_id: this.shopId };
      if (this.range.from) filter['created_at__gte'] = this.range.from;
      if (this.range.to) filter['created_at__lt'] = this.range.to;
      const [all, customers] = await Promise.all([
        this.crud.list<Order>('orders', filter, 'created_at.desc'),
        this.crud.list<{ user_id: string; name: string | null; phone: string | null }>('shop_customers', { shop_id: this.shopId }),
      ]);
      // Tabs and their counts are for the chosen period.
      const counts: Partial<Record<OrderStatus, number>> = {};
      for (const o of all) counts[o.status] = (counts[o.status] ?? 0) + 1;
      const statuses = TABS.find((t) => t.key === this.tab())!.statuses;
      this.orders.set(all.filter((o) => statuses.includes(o.status)));
      this.counts.set(counts);
      this.customers.set(new Map(customers.map((c) => [c.user_id, c.name || (c.phone ? `+${c.phone}` : '')])));
    } catch (err) {
      if (showLoading) this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected customerName(id: string): string {
    return this.customers().get(id) ?? '';
  }
}

