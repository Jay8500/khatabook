import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';
import { Order, OrderStatus, ShopState } from '../../core/types/store';
import { DateRange, DateRangeFilter, defaultRangeKey, resolveRange } from '../../shared/date-range/date-range';
import { OrderCard } from './order-card';

interface MyShop {
  id: string;
  name: string;
  slug: string;
  state: ShopState;
}

const STATUS_GROUPS: Record<string, OrderStatus[]> = {
  all: [],
  ongoing: ['requested', 'accepted', 'packed', 'ready'],
  completed: ['completed'],
  cancelled: ['rejected', 'cancelled'],
};
const NOTICE_KEY = 'khata.shopNoticeSeen';

/** Customer home: shops they use (with closing/closed notices) + order history with filters. */
@Component({
  selector: 'app-my-orders',
  imports: [DateRangeFilter, OrderCard, RouterLink],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('orders.greeting', { name: auth.displayName() }) }}</h1>

    <section class="mt-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">{{ config.label('orders.myShops') }}</h2>
        <a routerLink="/join" class="text-sm font-medium text-primary">+ {{ config.label('join.title') }}</a>
      </div>
      @for (s of notices(); track s.id) {
        <p class="mt-2 rounded-xl px-3 py-2 text-sm" [class]="s.state === 'closed' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'">
          {{ config.label('shopState.notice.' + s.state, { shop: s.name }) }}
        </p>
      }
      @if (shops().length === 0) {
        <a routerLink="/join" class="mt-2 block rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">{{ config.label('orders.noShops') }}</a>
      } @else {
        <div class="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          @for (s of shops(); track s.id) {
            <a [routerLink]="['/s', s.slug]" class="shrink-0 rounded-2xl border border-border bg-surface px-4 py-3 font-medium hover:border-primary" [class.opacity-60]="s.state === 'closed'">
              {{ s.name }}
              @if (s.state !== 'open') {
                <span class="ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" [class]="s.state === 'closed' ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning'">{{ config.label('shopState.' + s.state) }}</span>
              } @else {
                <span class="text-primary">→</span>
              }
            </a>
          }
        </div>
      }
    </section>

    <section class="mt-6">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">{{ config.label('orders.history') }}</h2>
        <app-date-range (changed)="setRange($event)" />
      </div>
      <div class="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        @for (g of groups; track g) {
          <button
            type="button"
            class="shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium"
            [class]="group() === g ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'"
            (click)="group.set(g)"
          >
            {{ config.label('orders.group.' + g) }} <span class="opacity-70">{{ countFor(g) }}</span>
          </button>
        }
      </div>

      @if (loading()) {
        <p class="py-10 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
      } @else if (visible().length === 0) {
        <p class="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{{ config.label('orders.noneInRange') }}</p>
      } @else {
        <ul class="mt-3 grid gap-2">
          @for (o of visible(); track o.id) {
            <li><app-order-card [order]="o" [who]="shopName(o.shop_id)" /></li>
          }
        </ul>
      }
    </section>
  `,
})
export class MyOrders {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly groups = Object.keys(STATUS_GROUPS);
  protected readonly group = signal('all');
  protected readonly shops = signal<MyShop[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  private range: DateRange = resolveRange(defaultRangeKey(this.config));
  private readonly names = computed(() => new Map(this.shops().map((s) => [s.id, s.name])));

  protected readonly notices = computed(() => this.shops().filter((s) => s.state === 'closing' || s.state === 'closed'));
  protected readonly visible = computed(() => {
    const statuses = STATUS_GROUPS[this.group()];
    return statuses.length ? this.orders().filter((o) => statuses.includes(o.status)) : this.orders();
  });

  constructor() {
    void this.loadShops();
    void this.loadOrders();
  }

  protected setRange(range: DateRange): void {
    this.range = range;
    void this.loadOrders();
  }

  protected countFor(g: string): number {
    const statuses = STATUS_GROUPS[g];
    return statuses.length ? this.orders().filter((o) => statuses.includes(o.status)).length : this.orders().length;
  }

  private async loadShops(): Promise<void> {
    try {
      const shops = await this.store.myShops();
      this.shops.set(shops as MyShop[]);
      this.announce();
    } catch (err) {
      this.toast.error(err);
    }
  }

  private async loadOrders(): Promise<void> {
    this.loading.set(true);
    try {
      const filter: Record<string, unknown> = { customer_id: this.auth.profile()?.id ?? null };
      if (this.range.from) filter['created_at__gte'] = this.range.from;
      if (this.range.to) filter['created_at__lt'] = this.range.to;
      this.orders.set(await this.crud.list<Order>('orders', filter, 'created_at.desc'));
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** One pop-up per shop and state change, so the news is noticed but not repeated. */
  private announce(): void {
    let seen: Record<string, string> = {};
    try {
      seen = JSON.parse(localStorage.getItem(NOTICE_KEY) ?? '{}');
    } catch {
      seen = {};
    }
    for (const s of this.notices()) {
      if (seen[s.id] === s.state) continue;
      this.toast.show(`shopState.${s.state}Toast`, s.state === 'closed' ? 'error' : 'warning', { shop: s.name }, undefined, true);
      seen[s.id] = s.state;
    }
    try {
      localStorage.setItem(NOTICE_KEY, JSON.stringify(seen));
    } catch {
      // Without storage the pop-up may show again next time.
    }
  }

  protected shopName(id: string): string {
    return this.names().get(id) ?? '';
  }
}
