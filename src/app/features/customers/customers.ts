import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { whatsappLink } from '../../core/services/orders.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { Order } from '../../core/types/store';
import { Avatar } from '../../shared/avatar/avatar';
import { OrderCard } from '../orders/order-card';

export interface ShopCustomer {
  user_id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  joined_at: string;
  orders: number;
  paid: number;
  bought: number;
  last_order_at: string | null;
}

/** "+91 98765 43210" from stored digits. */
export function prettyPhone(phone: string | null, digits: number): string {
  if (!phone) return '';
  const local = phone.slice(-digits);
  const country = phone.slice(0, phone.length - local.length);
  const half = Math.ceil(local.length / 2);
  return `${country ? '+' + country + ' ' : ''}${local.slice(0, half)} ${local.slice(half)}`;
}

/** Shop owner: /customers (list) and /customers/:id (one customer's orders). */
@Component({
  selector: 'app-customers',
  imports: [Avatar, OrderCard, RouterLink],
  template: `
    @if (!id()) {
      <div class="flex items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('customers.title') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ config.label('customers.hint') }}</p>
        </div>
        <span class="shrink-0 rounded-2xl bg-primary px-4 py-2 text-center text-on-primary">
          <span class="block text-2xl font-bold leading-none">{{ customers().length }}</span>
          <span class="text-[11px]">{{ config.label('customers.count') }}</span>
        </span>
      </div>

      <input
        type="search"
        class="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        [placeholder]="config.label('customers.search')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />

      @if (loading()) {
        <p class="py-10 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
      } @else if (filtered().length === 0) {
        <p class="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">{{ config.label('customers.none') }}</p>
      } @else {
        <ul class="mt-4 grid gap-2 sm:grid-cols-2">
          @for (c of filtered(); track c.user_id) {
            <li class="min-w-0 rounded-2xl border border-border bg-surface p-4">
              <a [routerLink]="['/customers', c.user_id]" class="flex items-center gap-3">
                <app-avatar [url]="c.avatar_url" [name]="c.name" [size]="48" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ c.name || phone(c) }}</span>
                  <span class="block text-sm text-muted">{{ phone(c) }}</span>
                  <span class="block text-xs text-muted">{{ config.label('customers.joined', { date: config.date(c.joined_at) }) }}</span>
                </span>
                <span class="shrink-0 text-right">
                  <span class="block font-bold">{{ config.money(c.paid) }}</span>
                  <span class="text-xs text-muted">{{ config.label('customers.orders', { count: c.orders }) }}</span>
                </span>
              </a>
              <div class="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                @if (whatsapp(c); as wa) {
                  <a [href]="wa" target="_blank" rel="noopener" class="rounded-xl bg-success px-3 py-2 text-center text-sm font-semibold text-white">{{ config.label('customers.whatsapp') }}</a>
                }
                @if (c.phone) {
                  <a [href]="'tel:+' + c.phone" class="rounded-xl border border-border px-3 py-2 text-center text-sm font-semibold">{{ config.label('customers.call') }}</a>
                }
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <!-- One customer -->
      <a routerLink="/customers" class="text-sm font-medium text-primary">← {{ config.label('customers.title') }}</a>
      @if (selected(); as c) {
        <section class="mt-3 flex items-center gap-4 rounded-3xl border border-border bg-surface p-5">
          <app-avatar [url]="c.avatar_url" [name]="c.name" [size]="72" />
          <div class="min-w-0">
            <h1 class="truncate text-xl font-bold">{{ c.name || phone(c) }}</h1>
            <p class="text-sm text-muted">{{ phone(c) }}</p>
            <p class="text-xs text-muted">{{ config.label('customers.joined', { date: config.date(c.joined_at) }) }}</p>
          </div>
        </section>
        <section class="mt-3 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-2xl border border-border bg-surface p-3"><p class="text-lg font-bold">{{ c.orders }}</p><p class="text-xs text-muted">{{ config.label('customers.ordersLabel') }}</p></div>
          <div class="rounded-2xl border border-border bg-surface p-3"><p class="text-lg font-bold">{{ config.money(c.paid) }}</p><p class="text-xs text-muted">{{ config.label('customers.paid') }}</p></div>
          <div class="rounded-2xl border border-border bg-surface p-3"><p class="text-lg font-bold">{{ config.money(c.bought) }}</p><p class="text-xs text-muted">{{ config.label('customers.bought') }}</p></div>
        </section>
        <div class="mt-3 grid grid-cols-2 gap-2">
          @if (whatsapp(c); as wa) {
            <a [href]="wa" target="_blank" rel="noopener" class="rounded-xl bg-success px-3 py-2.5 text-center font-semibold text-white">{{ config.label('customers.whatsapp') }}</a>
          }
          @if (c.phone) {
            <a [href]="'tel:+' + c.phone" class="rounded-xl border border-border px-3 py-2.5 text-center font-semibold">{{ config.label('customers.call') }}</a>
          }
        </div>
        <h2 class="mt-5 text-sm font-semibold">{{ config.label('customers.ordersLabel') }}</h2>
        @if (orders().length === 0) {
          <p class="mt-2 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{{ config.label('orders.none') }}</p>
        } @else {
          <ul class="mt-2 grid gap-2">
            @for (o of orders(); track o.id) {
              <li><app-order-card [order]="o" [who]="c.name ?? ''" /></li>
            }
          </ul>
        }
      } @else if (!loading()) {
        <p class="py-16 text-center text-sm text-muted">{{ config.label('orders.notFound') }}</p>
      }
    }
  `,
})
export class Customers {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly supabase = inject(SupabaseService);
  private readonly toast = inject(ToastService);

  /** Route param for the detail view. */
  readonly id = input<string>();

  protected readonly customers = signal<ShopCustomer[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly loading = signal(true);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return this.customers();
    return this.customers().filter((c) => `${c.name ?? ''}${c.phone ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(q));
  });
  protected readonly selected = computed(() => this.customers().find((c) => c.user_id === this.id()) ?? null);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const shopId = this.auth.shop()?.id;
    if (!shopId) return;
    try {
      this.customers.set(await this.supabase.callSecureRpc<ShopCustomer[]>('shop_customers_summary', { p_shop_id: shopId }));
      if (this.id()) {
        this.orders.set(await this.crud.list<Order>('orders', { shop_id: shopId, customer_id: this.id()! }, 'created_at.desc'));
      }
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected phone(c: ShopCustomer): string {
    return prettyPhone(c.phone, this.config.get<number>('PHONE_DIGITS') ?? 10);
  }

  protected whatsapp(c: ShopCustomer): string | null {
    return whatsappLink(c.phone, this.config.label('customers.whatsappText', { name: c.name ?? '', shop: this.auth.shop()?.name ?? '' }));
  }
}
