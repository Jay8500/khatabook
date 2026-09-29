import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';
import { Order } from '../../core/types/store';
import { OrderCard } from './order-card';

/** Customer home: shops they belong to + their orders. */
@Component({
  selector: 'app-my-orders',
  imports: [OrderCard, RouterLink],
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('orders.greeting', { name: auth.displayName() }) }}</h1>

    <section class="mt-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">{{ config.label('orders.myShops') }}</h2>
        <a routerLink="/join" class="text-sm font-medium text-primary">+ {{ config.label('join.title') }}</a>
      </div>
      @if (shops().length === 0) {
        <a routerLink="/join" class="mt-2 block rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">{{ config.label('orders.noShops') }}</a>
      } @else {
        <div class="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          @for (s of shops(); track s.id) {
            <a [routerLink]="['/s', s.slug]" class="shrink-0 rounded-2xl border border-border bg-surface px-4 py-3 font-medium hover:border-primary">
              {{ s.name }} <span class="text-primary">→</span>
            </a>
          }
        </div>
      }
    </section>

    <section class="mt-6">
      <h2 class="text-sm font-semibold">{{ config.label('orders.myTitle') }}</h2>
      @if (loading()) {
        <p class="py-10 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
      } @else if (orders().length === 0) {
        <p class="mt-2 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{{ config.label('orders.none') }}</p>
      } @else {
        <ul class="mt-2 grid gap-2">
          @for (o of orders(); track o.id) {
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

  protected readonly shops = signal<{ id: string; name: string; slug: string }[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  private readonly names = computed(() => new Map(this.shops().map((s) => [s.id, s.name])));

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [shops, orders] = await Promise.all([
        this.store.myShops(),
        this.crud.list<Order>('orders', { customer_id: this.auth.profile()?.id ?? null }, 'created_at.desc'),
      ]);
      this.shops.set(shops);
      this.orders.set(orders);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected shopName(id: string): string {
    return this.names().get(id) ?? '';
  }
}
