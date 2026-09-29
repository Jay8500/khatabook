import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';
import { StoreItem } from '../../core/types/store';
import { QtyStepper } from '../../shared/qty-stepper/qty-stepper';

/** Public shop store: /s/:slug. Browsing needs no login. */
@Component({
  selector: 'app-store-page',
  imports: [QtyStepper, RouterLink],
  template: `
    @if (loading()) {
      <p class="py-16 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    } @else if (!store.store()) {
      <div class="py-16 text-center">
        <p class="font-semibold">{{ config.label('store.notFound') }}</p>
        <a routerLink="/join" class="mt-3 inline-block font-medium text-primary">{{ config.label('join.title') }}</a>
      </div>
    } @else {
      @let shop = store.store()!.shop;

      <!-- Shop header -->
      <section class="rounded-3xl bg-primary px-5 py-6 text-on-primary">
        <h1 class="text-2xl font-bold">{{ shop.name }}</h1>
        @if (shop.store_note) {
          <p class="mt-1 text-sm opacity-90">{{ shop.store_note }}</p>
        }
        <div class="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          @if (shop.pickup_enabled) {
            <span class="rounded-full bg-black/15 px-3 py-1">{{ config.label('store.pickup') }}</span>
          }
          @if (shop.delivery_enabled) {
            <span class="rounded-full bg-black/15 px-3 py-1">
              {{ config.label('store.delivery') }}{{ shop.delivery_charge > 0 ? ' · ' + config.money(shop.delivery_charge) : '' }}
            </span>
          }
          @if (shop.min_order_amount > 0) {
            <span class="rounded-full bg-black/15 px-3 py-1">{{ config.label('store.minOrder', { amount: config.money(shop.min_order_amount) }) }}</span>
          }
        </div>
      </section>

      @if (!shop.store_enabled) {
        <p class="mt-6 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-center text-sm">{{ config.label('store.closed') }}</p>
      } @else {
        <!-- Search + categories -->
        <input
          type="search"
          class="mt-4 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
          [placeholder]="config.label('store.search')"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        @if (categories().length > 1) {
          <div class="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <button type="button" [class]="chip(category() === '')" (click)="category.set('')">{{ config.label('store.all') }}</button>
            @for (c of categories(); track c) {
              <button type="button" [class]="chip(category() === c)" (click)="category.set(c)">{{ c }}</button>
            }
          </div>
        }

        <!-- Items -->
        @if (items().length === 0) {
          <p class="py-12 text-center text-sm text-muted">{{ config.label('store.noItems') }}</p>
        } @else {
          <ul class="mt-4 grid grid-cols-2 gap-3 pb-28 sm:grid-cols-3 lg:grid-cols-4">
            @for (item of items(); track item.id) {
              @let qty = store.qtyOf(item.id);
              <li class="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface transition"
                  [class]="qty > 0 ? 'border-primary shadow-sm' : 'border-border'"
                  [class.opacity-60]="item.available <= 0">
                <div class="relative aspect-square bg-background">
                  @if (item.image_url) {
                    <img [src]="item.image_url" [alt]="item.name" loading="lazy" class="size-full object-cover" />
                  } @else {
                    <span class="grid size-full place-items-center text-3xl font-bold text-primary/40">{{ item.name.charAt(0) }}</span>
                  }
                  <!-- Stock indicator -->
                  <span class="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="stockClass(item)">
                    {{ stockText(item) }}
                  </span>
                </div>
                <div class="flex flex-1 flex-col p-3">
                  <p class="line-clamp-2 text-sm font-medium leading-snug">{{ item.name }}</p>
                  <div class="mt-auto flex items-end justify-between gap-2 pt-2">
                    <p class="min-w-0">
                      <span class="font-bold">{{ config.money(item.price) }}</span>
                      @if (item.unit) { <span class="text-xs text-muted"> / {{ item.unit }}</span> }
                    </p>
                    <app-qty-stepper [qty]="qty" [max]="item.available" (changed)="setQty(item, $event)" />
                  </div>
                </div>
              </li>
            }
          </ul>
        }

        <!-- Cart bar -->
        @if (store.cartCount() > 0) {
          <a
            [routerLink]="['/s', shop.slug, 'cart']"
            class="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-primary px-5 py-3.5 text-on-primary shadow-xl max-md:in-[.has-bottom-bar]:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
            [class.animate-bump]="bump()"
          >
            <span class="text-sm font-medium">{{ config.label('store.cartBar', { count: store.cartCount() }) }}</span>
            <span class="flex items-center gap-2 font-bold">{{ config.money(store.subtotal()) }} <span aria-hidden="true">→</span></span>
          </a>
        }
      }
    }
  `,
})
export class StorePage {
  protected readonly config = inject(ConfigService);
  protected readonly store = inject(StoreService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Route param. */
  readonly slug = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly bump = signal(false);

  protected readonly categories = computed(() => [
    ...new Set((this.store.store()?.items ?? []).map((i) => i.category).filter((c): c is string => !!c)),
  ]);

  protected readonly items = computed(() => {
    const q = this.query().trim().toLowerCase();
    const c = this.category();
    return (this.store.store()?.items ?? []).filter(
      (i) => (!c || i.category === c) && (!q || `${i.name} ${i.category ?? ''}`.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const store = await this.store.load(this.slug());
      // Signed-in visitors are linked to the shop so it appears in their "My shops".
      if (store && this.auth.isLoggedIn() && !this.auth.needsOnboarding()) {
        this.store.join(store.shop.id).catch(() => undefined);
      }
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected setQty(item: StoreItem, qty: number): void {
    this.store.setQty(item, qty);
    this.bump.set(false);
    requestAnimationFrame(() => this.bump.set(true));
  }

  protected chip(active: boolean): string {
    return `shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium ${active ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface'}`;
  }

  /** Low = at or below STORE_LOW_AVAILABLE. */
  private isLow(item: StoreItem): boolean {
    return item.available > 0 && item.available <= (this.config.get<number>('STORE_LOW_AVAILABLE') ?? 0);
  }

  protected stockText(item: StoreItem): string {
    if (item.available <= 0) return this.config.label('store.outOfStock');
    if (this.isLow(item)) return this.config.label('store.onlyLeft', { count: +item.available });
    return this.config.label('store.inStock');
  }

  protected stockClass(item: StoreItem): string {
    if (item.available <= 0) return 'bg-muted text-white';
    if (this.isLow(item)) return 'bg-warning text-white';
    return 'bg-success/90 text-white';
  }
}
