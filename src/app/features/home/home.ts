import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService, format } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { whatsappLink } from '../../core/services/orders.service';
import { ToastService } from '../../core/services/toast.service';
import { Row } from '../../core/types/models';
import { Order, OrderStatus } from '../../core/types/store';
import { Icon } from '../../shared/icon/icon';
import { OrderCard } from '../orders/order-card';

/** Order pipeline tiles; each opens that tab in Orders. */
const PIPELINE: { key: string; status: OrderStatus; tab: string }[] = [
  { key: 'new', status: 'requested', tab: 'new' },
  { key: 'accepted', status: 'accepted', tab: 'accepted' },
  { key: 'packed', status: 'packed', tab: 'packed' },
  { key: 'ready', status: 'ready', tab: 'ready' },
];
const OPEN: OrderStatus[] = PIPELINE.map((p) => p.status);

/** Shop owner's home: today's work on one screen, every common task one tap away. */
@Component({
  selector: 'app-home',
  imports: [Icon, OrderCard, RouterLink],
  template: `
    <section class="rounded-2xl bg-primary px-5 py-5 text-on-primary shadow-sm sm:px-8 sm:py-7">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl font-bold tracking-tight sm:text-2xl">{{ config.label('home.greeting', { name: auth.displayName() }) }}</h1>
          @if (auth.shop(); as shop) {
            <p class="truncate font-medium opacity-90">{{ shop.name }}</p>
            @if (planName() || shop.subscription_expires_at) {
              <p class="mt-2 inline-flex flex-wrap gap-x-1.5 rounded-full bg-black/10 px-3 py-0.5 text-xs">
                <span>{{ planName() }}</span>
                @if (shop.subscription_expires_at) {
                  <span>· {{ config.label('home.validTill', { date: config.date(shop.subscription_expires_at) }) }}</span>
                }
              </p>
            }
          }
        </div>
        @if (auth.shop()) {
          <a [href]="shareLink()" target="_blank" rel="noopener" class="shrink-0 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-primary shadow-sm">
            {{ config.label('home.shareStore') }}
          </a>
        }
      </div>
    </section>

    @if (auth.shop()) {
      <!-- Orders waiting on the shop -->
      <section class="mt-4">
        <div class="flex items-baseline justify-between">
          <h2 class="text-sm font-semibold">{{ config.label('home.ordersNow') }}</h2>
          <a routerLink="/shop-orders" class="text-sm font-medium text-primary">{{ config.label('common.viewAll') }}</a>
        </div>
        <div class="mt-2 grid grid-cols-4 gap-2">
          @for (p of pipeline; track p.key) {
            @let n = countOf(p.status);
            <a
              routerLink="/shop-orders"
              [queryParams]="{ tab: p.tab }"
              class="rounded-2xl border p-3 text-center"
              [class]="p.key === 'new' && n > 0 ? 'border-error/50 bg-error/10' : 'border-border bg-surface hover:border-primary'"
            >
              <p class="text-2xl font-bold tabular-nums" [class.text-error]="p.key === 'new' && n > 0">{{ n }}</p>
              <p class="mt-0.5 text-[11px] leading-tight text-muted">{{ config.label('orders.tab.' + p.key) }}</p>
            </a>
          }
        </div>
        <p class="mt-2 rounded-xl bg-surface px-3 py-2 text-sm">
          {{ config.label('home.todaySales') }}: <b class="tabular-nums">{{ config.money(todaySales()) }}</b>
          <span class="text-muted"> · {{ config.label('home.todayCompleted', { count: todayCompleted() }) }}</span>
        </p>
        @if (newest().length) {
          <ul class="mt-3 grid gap-2">
            @for (o of newest(); track o.id) {
              <li><app-order-card [order]="o" [who]="customerName(o.customer_id)" /></li>
            }
          </ul>
        }
      </section>

      <!-- One-tap tasks -->
      <section class="mt-5 grid grid-cols-4 gap-2">
        @for (a of actions; track a.key) {
          <a [routerLink]="a.link" [queryParams]="a.query" class="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-1 py-3 text-center hover:border-primary">
            <span class="grid size-10 place-items-center rounded-full bg-primary/10 text-primary"><app-icon [name]="a.icon" /></span>
            <span class="text-[11px] font-medium leading-tight">{{ config.label(a.key) }}</span>
          </a>
        }
      </section>

      <!-- Low stock -->
      <section class="mt-5 rounded-2xl border border-border bg-surface p-4">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            {{ config.label('home.lowStock') }}
            @if (unread().length) { <span class="ml-1 rounded-full bg-error px-2 py-0.5 text-xs font-bold text-white">{{ unread().length }}</span> }
          </h2>
          <a routerLink="/reminders" class="text-sm font-medium text-primary">{{ config.label('common.viewAll') }}</a>
        </div>
        @if (unread().length === 0) {
          <p class="mt-2 text-sm text-muted">{{ config.label('home.noReminders') }}</p>
        } @else {
          <ul class="mt-3 grid gap-2">
            @for (r of unread().slice(0, 5); track r['id']) {
              <li class="flex items-start justify-between gap-3 rounded-xl bg-background px-3 py-2.5 text-sm">
                <span>{{ r['message'] }}</span>
                <button type="button" class="shrink-0 text-xs font-medium text-primary" (click)="markRead(r)">
                  {{ config.label('reminders.markRead') }}
                </button>
              </li>
            }
          </ul>
          <a routerLink="/purchases" [queryParams]="{ add: 1 }" class="mt-3 block rounded-xl border border-border px-3 py-2 text-center text-sm font-medium text-primary">
            + {{ config.label('home.action.addBill') }}
          </a>
        }
      </section>
    } @else if (!auth.can('can_access_admin')) {
      <a routerLink="/onboarding" class="mt-5 block rounded-2xl border border-border bg-surface p-5 font-medium">
        {{ config.label('home.createShop') }}
      </a>
    }

    <section class="mt-5 grid grid-cols-2 gap-2 text-sm">
      @if (whatsappUrl(); as url) {
        <a [href]="url" target="_blank" rel="noopener" class="rounded-xl border border-border bg-surface px-3 py-3 text-center font-medium hover:border-success">
          {{ config.label('home.whatsappSupport') }}
        </a>
      }
      <a routerLink="/support" class="rounded-xl border border-border bg-surface px-3 py-3 text-center font-medium hover:border-primary" [class.col-span-2]="!whatsappUrl()">
        {{ config.label('home.raiseTicket') }}
      </a>
    </section>
  `,
})
export class Home {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly pipeline = PIPELINE;
  protected readonly actions = [
    { key: 'home.action.addStock', icon: 'box', link: '/stocks', query: { add: 1 } },
    { key: 'home.action.addBill', icon: 'receipt', link: '/purchases', query: { add: 1 } },
    { key: 'home.action.customers', icon: 'users', link: '/customers', query: {} },
    { key: 'home.action.myStore', icon: 'store', link: '/my-store', query: {} },
  ];

  private readonly open = signal<Order[]>([]);
  private readonly completedToday = signal<Order[]>([]);
  private readonly names = signal<Map<string, string>>(new Map());
  protected readonly unread = signal<Row[]>([]);
  protected readonly planName = signal('');

  protected readonly newest = computed(() => this.open().filter((o) => o.status === 'requested').slice(0, 3));
  protected readonly todaySales = computed(() => this.completedToday().reduce((sum, o) => sum + +o.total, 0));
  protected readonly todayCompleted = computed(() => this.completedToday().length);

  protected readonly shareLink = computed(() => {
    const shop = this.auth.shop() as unknown as Record<string, unknown> | null;
    const link = `${location.origin}/s/${shop?.['slug'] ?? ''}`;
    const text = format(this.config.label('myStore.shareText'), { shop: shop?.['name'], link, code: shop?.['join_code'] });
    return whatsappLink('', text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
  });

  protected readonly whatsappUrl = computed(() => {
    const number = (this.config.get<string>('SUPPORT_WHATSAPP_NUMBER') ?? '').replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });

  constructor() {
    void this.load();
    void this.loadOrders();
    // Keep the order tiles fresh while Home is open.
    const seconds = this.config.get<number>('ORDER_POLL_SECONDS') ?? 20;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.loadOrders();
    }, seconds * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected countOf(status: OrderStatus): number {
    return this.open().filter((o) => o.status === status).length;
  }

  protected customerName(id: string): string {
    return this.names().get(id) ?? '';
  }

  private async load(): Promise<void> {
    const shop = this.auth.shop();
    if (!shop) return;
    try {
      const [reminders, plans] = await Promise.all([
        this.crud.list('stock_reminders', { shop_id: shop.id, is_read: false }, 'reminder_date.desc'),
        shop.subscription_plan_id ? this.crud.list('pricing_plans', { id: shop.subscription_plan_id }) : Promise.resolve([]),
      ]);
      this.unread.set(reminders);
      this.planName.set(String(plans[0]?.['name'] ?? ''));
    } catch (err) {
      this.toast.error(err);
    }
  }

  private async loadOrders(): Promise<void> {
    const shop = this.auth.shop();
    if (!shop) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    try {
      const [open, done, customers] = await Promise.all([
        this.crud.list<Order>('orders', { shop_id: shop.id, status__in: OPEN }, 'created_at.desc'),
        this.crud.list<Order>('orders', { shop_id: shop.id, status: 'completed', updated_at__gte: today }),
        this.crud.list<{ user_id: string; name: string | null; phone: string | null }>('shop_customers', { shop_id: shop.id }),
      ]);
      this.open.set(open);
      this.completedToday.set(done);
      this.names.set(new Map(customers.map((c) => [c.user_id, c.name || (c.phone ? `+${c.phone}` : '')])));
    } catch {
      // Tiles stay as they were; the next refresh tries again.
    }
  }

  protected async markRead(reminder: Row): Promise<void> {
    try {
      await this.crud.update('stock_reminders', String(reminder['id']), { is_read: true });
      this.unread.update((list) => list.filter((r) => r['id'] !== reminder['id']));
    } catch (err) {
      this.toast.error(err);
    }
  }
}
