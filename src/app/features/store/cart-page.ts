import { Component, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';
import { Fulfilment } from '../../core/types/store';
import { QtyStepper } from '../../shared/qty-stepper/qty-stepper';
import { SwipeRow } from '../../shared/swipe-row/swipe-row';

const HINT_KEY = 'khata.cartSwipeHintSeen';
const DRAFT_KEY = (slug: string) => `khata.checkout.${slug}`;

/** /s/:slug/cart: review, choose pickup/delivery, add a note, request the order. */
@Component({
  selector: 'app-cart-page',
  imports: [QtyStepper, RouterLink, SwipeRow],
  template: `
    @if (store.store(); as data) {
      <a [routerLink]="['/s', data.shop.slug]" class="text-sm font-medium text-primary">← {{ data.shop.name }}</a>
      <h1 class="mt-2 text-xl font-bold sm:text-2xl">{{ config.label('cart.title') }}</h1>

      @if (store.cart().length === 0) {
        <div class="mt-8 rounded-2xl border border-dashed border-border py-12 text-center">
          <p class="text-sm text-muted">{{ config.label('cart.empty') }}</p>
          <a [routerLink]="['/s', data.shop.slug]" class="mt-3 inline-block font-medium text-primary">{{ config.label('cart.browse') }}</a>
        </div>
      } @else {
        <p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden="true">⇠</span> {{ config.label('cart.swipeHint') }}
        </p>

        <ul class="mt-3 grid gap-2">
          @for (line of store.cart(); track line.item.id; let first = $first) {
            <li>
              <app-swipe-row [hint]="first && showHint" (removed)="store.setQty(line.item, 0)" (incremented)="store.setQty(line.item, line.qty + 1)">
                <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                  <span class="grid h-10 w-3 shrink-0 place-items-center text-muted/60" aria-hidden="true">⋮⋮</span>
                  @if (line.item.image_url) {
                    <img [src]="line.item.image_url" alt="" class="size-12 shrink-0 rounded-xl object-cover" />
                  }
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ line.item.name }}</p>
                    <p class="text-xs text-muted">
                      {{ config.money(line.item.price) }}{{ line.item.unit ? ' / ' + line.item.unit : '' }}
                    </p>
                    <p class="text-sm font-bold">{{ config.money(line.qty * line.item.price) }}</p>
                  </div>
                  <app-qty-stepper [qty]="line.qty" [max]="line.item.available" (changed)="store.setQty(line.item, $event)" />
                  <button type="button" class="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-error/10 hover:text-error" [attr.aria-label]="config.label('cart.remove')" (click)="store.setQty(line.item, 0)">&times;</button>
                </div>
              </app-swipe-row>
            </li>
          }
        </ul>

        <!-- Pickup / delivery -->
        <section class="mt-5 rounded-2xl border border-border bg-surface p-4">
          <h2 class="text-sm font-semibold">{{ config.label('cart.howToGet') }}</h2>
          <div class="mt-3 grid gap-2" [class.grid-cols-2]="options().length > 1">
            @for (o of options(); track o) {
              <button
                type="button"
                class="rounded-xl border-2 px-3 py-3 text-left text-sm"
                [class]="fulfilment() === o ? 'border-primary bg-primary/10' : 'border-border'"
                (click)="fulfilment.set(o)"
              >
                <span class="block font-semibold">{{ config.label('store.' + o) }}</span>
                <span class="text-xs text-muted">
                  @if (o === 'delivery') {
                    {{ data.shop.delivery_charge > 0 ? config.money(data.shop.delivery_charge) : config.label('cart.free') }}
                  } @else {
                    {{ data.shop.address || config.label('cart.atShop') }}
                  }
                </span>
              </button>
            }
          </div>
          @if (fulfilment() === 'delivery') {
            @if (data.shop.delivery_note) {
              <p class="mt-3 text-xs text-muted">{{ data.shop.delivery_note }}</p>
            }
            <textarea
              rows="2"
              class="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              [placeholder]="config.label('cart.address')"
              [value]="address()"
              (input)="address.set($any($event.target).value)"
            ></textarea>
          }
          <textarea
            rows="2"
            class="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            [placeholder]="config.label('cart.note')"
            [value]="note()"
            (input)="note.set($any($event.target).value)"
          ></textarea>
        </section>

        <!-- Totals -->
        <section class="mt-4 grid gap-1.5 rounded-2xl border border-border bg-surface p-4 text-sm pb-28 md:pb-4">
          <div class="flex justify-between"><span class="text-muted">{{ config.label('cart.items', { count: store.cartCount() }) }}</span><span>{{ config.money(store.subtotal()) }}</span></div>
          @if (fee() > 0) {
            <div class="flex justify-between"><span class="text-muted">{{ config.label('cart.deliveryCharge') }}</span><span>{{ config.money(fee()) }}</span></div>
          }
          <div class="mt-1 flex justify-between border-t border-border pt-2 text-base font-bold"><span>{{ config.label('cart.total') }}</span><span>{{ config.money(store.subtotal() + fee()) }}</span></div>
          @if (belowMin()) {
            <p class="mt-1 text-xs text-warning">{{ config.label('cart.belowMin', { amount: config.money(data.shop.min_order_amount) }) }}</p>
          }
          <p class="mt-1 text-xs text-muted">{{ config.label('cart.payLater') }}</p>
        </section>

        <div class="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md max-md:in-[.has-bottom-bar]:bottom-[calc(5rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            class="w-full rounded-2xl bg-primary px-5 py-4 text-base font-bold text-on-primary shadow-xl disabled:opacity-50"
            [disabled]="busy() || belowMin()"
            (click)="submit()"
          >
            {{ config.label(busy() ? 'common.loading' : 'cart.request') }} · {{ config.money(store.subtotal() + fee()) }}
          </button>
        </div>
      }
    } @else {
      <p class="py-16 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    }
  `,
})
export class CartPage {
  protected readonly config = inject(ConfigService);
  protected readonly store = inject(StoreService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly slug = input.required<string>();

  protected readonly fulfilment = signal<Fulfilment>('pickup');
  protected readonly address = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected showHint = false;

  protected readonly options = computed<Fulfilment[]>(() => {
    const shop = this.store.store()?.shop;
    if (!shop) return [];
    return [...(shop.pickup_enabled ? ['pickup' as const] : []), ...(shop.delivery_enabled ? ['delivery' as const] : [])];
  });
  protected readonly fee = computed(() =>
    this.fulfilment() === 'delivery' ? Number(this.store.store()?.shop.delivery_charge ?? 0) : 0,
  );
  protected readonly belowMin = computed(() => this.store.subtotal() < Number(this.store.store()?.shop.min_order_amount ?? 0));

  async ngOnInit(): Promise<void> {
    try {
      this.showHint = !localStorage.getItem(HINT_KEY);
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      this.showHint = false;
    }
    if (this.store.store()?.shop.slug !== this.slug()) await this.store.load(this.slug());
    const first = this.options()[0];
    if (first) this.fulfilment.set(first);
    // Signed in here (e.g. right after login): link them to the shop so the owner sees them.
    const shopId = this.store.store()?.shop.id;
    if (shopId && this.auth.isLoggedIn() && !this.auth.needsOnboarding()) this.store.join(shopId).catch(() => undefined);

    // Back from login / name step: restore the choices and send the order straight away.
    const draft = this.readDraft();
    if (draft) {
      if (this.options().includes(draft.fulfilment)) this.fulfilment.set(draft.fulfilment);
      this.address.set(draft.address);
      this.note.set(draft.note);
      if (this.route.snapshot.queryParamMap.get('submit') && this.auth.isLoggedIn() && !this.auth.needsOnboarding()) {
        this.clearDraft();
        if (this.store.cart().length) await this.submit();
      }
    }
  }

  /** Keeps pickup/delivery, address and note across the login + name screens. */
  private saveDraft(): void {
    try {
      sessionStorage.setItem(DRAFT_KEY(this.slug()), JSON.stringify({ fulfilment: this.fulfilment(), address: this.address(), note: this.note() }));
    } catch {
      // Without storage the customer re-enters them; the cart itself is kept.
    }
  }

  private readDraft(): { fulfilment: Fulfilment; address: string; note: string } | null {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT_KEY(this.slug())) ?? 'null');
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    try {
      sessionStorage.removeItem(DRAFT_KEY(this.slug()));
    } catch {
      // ignore
    }
  }

  protected async submit(): Promise<void> {
    if (this.fulfilment() === 'delivery' && !this.address().trim()) {
      this.toast.show('address_required', 'warning');
      return;
    }
    // Login (as a customer) and name first; we come back here and the order is sent automatically.
    const back = `/s/${this.slug()}/cart?submit=1`;
    if (!this.auth.isLoggedIn()) {
      this.saveDraft();
      this.toast.show('loginToOrder', 'info');
      await this.router.navigate(['/login'], { queryParams: { returnUrl: back, as: 'customer' } });
      return;
    }
    if (this.auth.needsOnboarding()) {
      this.saveDraft();
      await this.router.navigate(['/onboarding'], { queryParams: { returnUrl: back } });
      return;
    }

    this.busy.set(true);
    try {
      const orderId = await this.store.placeOrder(this.fulfilment(), this.address(), this.note());
      this.store.clearCart();
      this.toast.show('orderPlaced', 'success');
      await this.router.navigate(['/orders', orderId]);
    } catch (err) {
      this.toast.error(err);
      // Stock may have changed: reload availability.
      await this.store.load(this.slug());
    } finally {
      this.busy.set(false);
    }
  }
}
