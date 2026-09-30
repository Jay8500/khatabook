import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConfigService, format } from '../../core/services/config.service';
import { NEXT_STATUS, OrdersService, upiLink, whatsappLink } from '../../core/services/orders.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';
import { OrderDetail as Detail, OrderStatus, PaymentMode } from '../../core/types/store';
import { QtyStepper } from '../../shared/qty-stepper/qty-stepper';
import { qrDataUrl } from '../../shared/qr';

const FLOW: OrderStatus[] = ['requested', 'accepted', 'packed', 'ready', 'completed'];

/** /orders/:id: one screen for both sides; actions depend on who is looking (viewer). */
@Component({
  selector: 'app-order-detail',
  imports: [QtyStepper, RouterLink],
  template: `
    @if (detail(); as d) {
      @let o = d.order;
      <a [routerLink]="isShop() ? '/shop-orders' : '/orders'" class="text-sm font-medium text-primary">← {{ config.label(isShop() ? 'orders.shopTitle' : 'orders.myTitle') }}</a>

      <!-- Header -->
      <div class="mt-2 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('orders.orderNo', { no: o.order_no }) }}</h1>
          <p class="truncate text-sm text-muted">
            {{ isShop() ? (d.customer.name || '+' + d.customer.phone) : d.shop.name }} · {{ config.date(o.created_at) }}
          </p>
        </div>
        <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" [class]="statusClass(o.status)">{{ statusLabel(o.status) }}</span>
      </div>

      <!-- Progress -->
      @if (o.status === 'rejected' || o.status === 'cancelled') {
        <p class="mt-4 rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">{{ statusLabel(o.status) }}{{ lastRemark() ? ': ' + lastRemark() : '' }}</p>
      } @else {
        <ol class="mt-5 grid grid-cols-5 gap-1">
          @for (s of flow; track s; let i = $index) {
            <li class="text-center">
              <span class="mx-auto block h-1.5 rounded-full" [class]="stepIndex() >= i ? 'bg-primary' : 'bg-border'"></span>
              <span class="mt-1.5 block text-[10px] font-medium leading-tight sm:text-xs" [class]="stepIndex() >= i ? 'text-text' : 'text-muted'">{{ statusLabel(s) }}</span>
            </li>
          }
        </ol>
      }

      <!-- Shop: accept / reject a new request -->
      @if (isShop() && o.status === 'requested') {
        <section class="mt-5 rounded-2xl border-2 border-primary bg-surface p-4">
          <h2 class="font-semibold">{{ config.label('orders.reviewTitle') }}</h2>
          <p class="text-xs text-muted">{{ config.label('orders.reviewHint') }}</p>
          <ul class="mt-3 grid gap-2">
            @for (item of d.items; track item.id) {
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ item.product_name }}</span>
                  <span class="text-xs text-muted">{{ config.label('orders.asked', { qty: +item.qty_requested, unit: item.unit || '' }) }} · {{ config.money(item.price) }}</span>
                </span>
                <app-qty-stepper [qty]="acceptQty()[item.id] ?? +item.qty_requested" [max]="+item.qty_requested" (changed)="setAcceptQty(item.id, $event)" />
              </li>
            }
          </ul>
          <div class="mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>{{ config.label('cart.total') }}</span><span>{{ config.money(acceptTotal()) }}</span>
          </div>

          <p class="mt-4 text-sm font-medium">{{ config.label('orders.paymentTitle') }}</p>
          <div class="mt-2 grid grid-cols-3 gap-2">
            @for (m of modes; track m) {
              <button type="button" class="rounded-xl border-2 px-2 py-2.5 text-xs font-semibold" [class]="mode() === m ? 'border-primary bg-primary/10' : 'border-border'" (click)="setMode(m)">
                {{ config.label('paymentMode.' + m) }}
              </button>
            }
          </div>
          @if (mode() === 'advance') {
            <label class="mt-3 grid gap-1 text-sm">
              <span class="text-muted">{{ config.label('orders.advanceAmount') }}</span>
              <input type="number" min="0" [class]="inputClass" [value]="advance()" (input)="advance.set(+$any($event.target).value)" />
            </label>
          }
          <textarea rows="2" [class]="inputClass + ' mt-3'" [placeholder]="config.label('orders.remarkForCustomer')" [value]="remark()" (input)="remark.set($any($event.target).value)"></textarea>
          <div class="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <button type="button" class="rounded-xl border border-error/40 px-4 py-3 text-sm font-semibold text-error" [disabled]="busy()" (click)="reject()">{{ config.label('orders.reject') }}</button>
            <button type="button" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || acceptTotal() === 0" (click)="accept()">
              {{ config.label('orders.accept') }} · {{ config.money(acceptTotal()) }}
            </button>
          </div>
        </section>
      }

      <!-- Items -->
      <section class="mt-5 rounded-2xl border border-border bg-surface p-4">
        <ul class="grid gap-2.5">
          @for (item of d.items; track item.id) {
            <li class="flex items-center gap-3 text-sm">
              @if (item.image_url) {
                <img [src]="item.image_url" alt="" class="size-10 shrink-0 rounded-lg object-cover" />
              }
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ item.product_name }}</span>
                <span class="text-xs text-muted">
                  @if (item.qty_accepted !== null && +item.qty_accepted !== +item.qty_requested) {
                    <s>{{ +item.qty_requested }}</s> → <b class="text-warning">{{ +item.qty_accepted }}</b>
                  } @else {
                    {{ +(item.qty_accepted ?? item.qty_requested) }}
                  }
                  {{ item.unit || '' }} × {{ config.money(item.price) }}
                </span>
              </span>
              <span class="font-semibold">{{ config.money(+(item.qty_accepted ?? item.qty_requested) * item.price) }}</span>
            </li>
          }
        </ul>
        <div class="mt-3 grid gap-1 border-t border-border pt-3 text-sm">
          <div class="flex justify-between"><span class="text-muted">{{ config.label('orders.subtotal') }}</span><span>{{ config.money(o.subtotal) }}</span></div>
          @if (+o.delivery_charge > 0) {
            <div class="flex justify-between"><span class="text-muted">{{ config.label('cart.deliveryCharge') }}</span><span>{{ config.money(o.delivery_charge) }}</span></div>
          }
          <div class="flex justify-between text-base font-bold"><span>{{ config.label('cart.total') }}</span><span>{{ config.money(o.total) }}</span></div>
          @if (+o.amount_paid > 0) {
            <div class="flex justify-between text-success"><span>{{ config.label('orders.paid') }}</span><span>{{ config.money(o.amount_paid) }}</span></div>
            <div class="flex justify-between font-semibold"><span>{{ config.label('orders.balance') }}</span><span>{{ config.money(balance()) }}</span></div>
          }
        </div>
        <p class="mt-3 rounded-xl bg-background p-3 text-xs">
          <b>{{ config.label('store.' + o.fulfilment) }}</b>
          · {{ o.fulfilment === 'delivery' ? o.delivery_address : (d.shop.address || d.shop.name) }}
        </p>
      </section>

      <!-- Payment -->
      @if (o.payment_mode && o.status !== 'rejected' && o.status !== 'cancelled') {
        <section class="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-semibold">{{ config.label('orders.paymentTitle') }}</h2>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" [class]="paymentClass()">{{ config.label('paymentStatus.' + o.payment_status) }}</span>
          </div>
          <p class="mt-1 text-sm text-muted">{{ paymentTerms() }}</p>

          @if (!isShop()) {
            @if (o.payment_status === 'pending_verification') {
              <p class="mt-3 rounded-xl bg-info/10 p-3 text-sm text-info">{{ config.label('orders.waitingConfirm') }}</p>
            } @else if (payNow() > 0) {
              @if (d.shop.upi_id) {
                <a [href]="upi()" class="mt-3 flex items-center justify-center rounded-xl bg-primary px-4 py-3 font-bold text-on-primary">
                  {{ config.label('orders.payUpi', { amount: config.money(payNow()) }) }}
                </a>
                @if (qr()) {
                  <div class="mt-3 hidden text-center sm:block">
                    <img [src]="qr()" alt="" class="mx-auto size-44 rounded-xl border border-border bg-white p-2" />
                    <p class="mt-1 text-xs text-muted">{{ config.label('orders.scanToPay') }} · {{ d.shop.upi_id }}</p>
                  </div>
                }
              } @else {
                <p class="mt-3 text-sm">{{ config.label('orders.noUpi') }}</p>
              }
              <!-- Paid by UPI, cash or bank: the customer tells the shop either way. -->
              <form class="mt-4 grid gap-2" (submit)="$event.preventDefault(); reportPaid()">
                <p class="text-sm font-medium">{{ config.label('orders.afterPaying') }}</p>
                <input [class]="inputClass" [placeholder]="config.label('orders.utr')" [value]="utr()" (input)="utr.set($any($event.target).value)" />
                <button type="submit" class="rounded-xl border-2 border-primary px-4 py-2.5 font-semibold text-primary" [disabled]="busy()">{{ config.label('orders.iHavePaid') }}</button>
              </form>

            }
          } @else if (balance() > 0) {
            <form class="mt-3 grid grid-cols-[1fr_auto] gap-2" (submit)="$event.preventDefault(); confirmPayment()">
              <input type="number" min="0" [class]="inputClass" [value]="received()" (input)="received.set(+$any($event.target).value)" />
              <button type="submit" class="rounded-xl bg-success px-4 font-semibold text-white" [disabled]="busy()">{{ config.label('orders.markReceived') }}</button>
            </form>
            @if (o.payment_reference) {
              <p class="mt-2 text-xs text-muted">{{ config.label('orders.customerRef', { ref: o.payment_reference }) }}</p>
            }
          }
        </section>
      }

      <!-- Next steps -->
      @if (isShop() && nextSteps().length) {
        <section class="mt-4 rounded-2xl border border-border bg-surface p-4">
          <textarea rows="2" [class]="inputClass" [placeholder]="config.label('orders.remarkForCustomer')" [value]="remark()" (input)="remark.set($any($event.target).value)"></textarea>
          <div class="mt-3 grid gap-2">
            @for (s of nextSteps(); track s) {
              <button
                type="button"
                class="rounded-xl px-4 py-3 font-semibold disabled:opacity-50"
                [class]="s === 'cancelled' ? 'border border-error/40 text-error' : 'bg-primary text-on-primary'"
                [disabled]="busy()"
                (click)="move(s)"
              >
                {{ nextLabel(s) }}
              </button>
            }
          </div>
        </section>
      }

      <!-- Contact + customer actions -->
      <section class="mt-4 grid gap-2 sm:grid-cols-2">
        @if (whatsapp(); as wa) {
          <a [href]="wa" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 font-semibold text-white">
            {{ config.label(isShop() ? 'orders.whatsappCustomer' : 'orders.whatsappShop') }}
          </a>
        }
        @if (!isShop() && canReorder()) {
          <button type="button" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary" (click)="orderAgain()">{{ config.label('orders.orderAgain') }}</button>
        }
        @if (!isShop() && canCancel()) {
          <button type="button" class="rounded-xl border border-error/40 px-4 py-3 font-semibold text-error" [disabled]="busy()" (click)="cancel()">{{ config.label('orders.cancelMine') }}</button>
        }
      </section>

      <!-- Timeline -->
      <section class="mt-5">
        <h2 class="text-sm font-semibold">{{ config.label('orders.timeline') }}</h2>
        <ol class="mt-3 grid gap-3 border-l-2 border-border pl-4">
          @for (e of d.events; track e.id) {
            <li class="relative">
              <span class="absolute -left-[21px] top-1 size-3 rounded-full border-2 border-surface" [class]="e.status ? 'bg-primary' : 'bg-muted'"></span>
              <p class="text-sm">
                <b>{{ e.status ? statusLabel(e.status) : config.label('orders.note') }}</b>
                <span class="text-xs text-muted"> · {{ actorLabel(e.actor_role) }} · {{ time(e.created_at) }}</span>
              </p>
              @if (e.remark) {
                <p class="mt-0.5 rounded-lg bg-background px-3 py-1.5 text-sm">{{ e.remark }}</p>
              }
            </li>
          }
        </ol>
        <form class="mt-4 grid grid-cols-[1fr_auto] gap-2" (submit)="$event.preventDefault(); addNote()">
          <input [class]="inputClass" [placeholder]="config.label('orders.addNote')" [value]="note()" (input)="note.set($any($event.target).value)" />
          <button type="submit" class="rounded-xl border border-border px-4 font-medium" [disabled]="busy() || !note().trim()">{{ config.label('orders.send') }}</button>
        </form>
      </section>
      <div class="h-6"></div>
    } @else if (notFound()) {
      <p class="py-16 text-center text-sm text-muted">{{ config.label('orders.notFound') }}</p>
    } @else {
      <p class="py-16 text-center text-sm text-muted">{{ config.label('common.loading') }}</p>
    }
  `,
})
export class OrderDetailPage {
  protected readonly config = inject(ConfigService);
  private readonly orders = inject(OrdersService);
  private readonly toast = inject(ToastService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** ?reorder=1 (from the order list): order again as soon as the order loads. */
  readonly reorder = input<string | undefined>(undefined);
  private reordered = false;

  protected readonly flow = FLOW;
  protected readonly modes: PaymentMode[] = ['full', 'advance', 'cod'];
  protected readonly inputClass =
    'w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary';

  protected readonly detail = signal<Detail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly remark = signal('');
  protected readonly note = signal('');
  protected readonly utr = signal('');
  protected readonly received = signal(0);
  protected readonly acceptQty = signal<Record<string, number>>({});
  protected readonly mode = signal<PaymentMode>('full');
  protected readonly advance = signal(0);
  protected readonly qr = signal<string | null>(null);

  protected readonly isShop = computed(() => this.detail()?.viewer === 'shop');
  protected readonly stepIndex = computed(() => FLOW.indexOf(this.detail()?.order.status ?? 'requested'));
  protected readonly balance = computed(() => {
    const o = this.detail()?.order;
    return o ? Math.max(+o.total - +o.amount_paid, 0) : 0;
  });
  protected readonly payNow = computed(() => {
    const o = this.detail()?.order;
    return o ? Math.max(+o.amount_due_now - +o.amount_paid, 0) : 0;
  });
  protected readonly lastRemark = computed(() => [...(this.detail()?.events ?? [])].reverse().find((e) => e.remark)?.remark ?? '');
  protected readonly nextSteps = computed(() => NEXT_STATUS[this.detail()?.order.status ?? 'requested'] ?? []);
  protected readonly canCancel = computed(() => {
    const o = this.detail()?.order;
    return !!o && ['requested', 'accepted'].includes(o.status) && o.payment_status === 'unpaid' && +o.amount_paid === 0;
  });
  protected readonly canReorder = computed(() => {
    const d = this.detail();
    return !!d && ['completed', 'cancelled', 'rejected'].includes(d.order.status) && d.items.some((i) => i.stock_id);
  });

  /** Same items and quantities into the shop's cart, then straight to the cart. */
  protected orderAgain(): void {
    const d = this.detail();
    if (!d) return;
    const lines = d.items
      .filter((i) => i.stock_id)
      .map((i) => ({ id: i.stock_id!, qty: +(i.qty_accepted ?? i.qty_requested) || +i.qty_requested }));
    this.storeService.prefillCart(d.shop.slug, lines);
    this.toast.show('reorderReady', 'info');
    void this.router.navigate(['/s', d.shop.slug, 'cart']);
  }

  protected readonly acceptTotal = computed(() => {
    const d = this.detail();
    if (!d) return 0;
    const qty = this.acceptQty();
    const sub = d.items.reduce((sum, i) => sum + (qty[i.id] ?? +i.qty_requested) * +i.price, 0);
    return sub > 0 ? sub + +d.order.delivery_charge : 0;
  });
  protected readonly upi = computed(() => {
    const d = this.detail();
    if (!d?.shop.upi_id) return '';
    return upiLink(d.shop.upi_id, d.shop.upi_name || d.shop.name, this.payNow(),
      this.config.label('orders.orderNo', { no: d.order.order_no }));
  });
  protected readonly whatsapp = computed(() => {
    const d = this.detail();
    if (!d) return null;
    if (!this.isShop()) {
      return whatsappLink(d.shop.contact_phone, this.config.label('orders.orderNo', { no: d.order.order_no }));
    }
    const templates = this.config.get<Record<string, string>>('ORDER_WHATSAPP') ?? {};
    const o = d.order;
    const key = o.status === 'ready' ? `ready_${o.fulfilment}` : o.status;
    const text = format(templates[key] ?? templates['default'] ?? '', {
      customer: d.customer.name ?? '',
      shop: d.shop.name,
      order_no: o.order_no,
      total: this.config.money(o.total),
      amount_due: this.config.money(this.payNow()),
      balance: this.config.money(this.balance()),
      remark: this.lastRemark(),
      link: `${location.origin}/orders/${o.id}`,
    });
    return whatsappLink(d.customer.phone, text);
  });

  constructor() {
    const seconds = this.config.get<number>('ORDER_POLL_SECONDS') ?? 20;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !this.busy()) void this.load(false);
    }, seconds * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit(): void {
    void this.load(true);
  }

  private async load(initial: boolean): Promise<void> {
    try {
      const d = await this.orders.get(this.id());
      if (!d) {
        this.notFound.set(true);
        return;
      }
      const changed = JSON.stringify(d) !== JSON.stringify(this.detail());
      this.detail.set(d);
      if (this.reorder() && !this.reordered && this.canReorder()) {
        this.reordered = true;
        this.orderAgain();
      }
      if (initial) {
        this.mode.set(d.shop.default_payment_mode ?? 'full');
        this.recomputeAdvance();
      }
      if (initial || changed) {
        this.received.set(Math.max(+d.order.amount_due_now - +d.order.amount_paid, 0) || Math.max(+d.order.total - +d.order.amount_paid, 0));
        void this.makeQr();
      }
    } catch (err) {
      if (initial) this.toast.error(err);
    }
  }

  private async makeQr(): Promise<void> {
    const link = this.upi();
    if (!link || this.payNow() <= 0) {
      this.qr.set(null);
      return;
    }
    this.qr.set(await qrDataUrl(link, 240));
  }

  private async run(action: () => Promise<void>, toastKey: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.remark.set('');
      this.toast.show(toastKey, 'success');
      await this.load(false);
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected setAcceptQty(itemId: string, qty: number): void {
    this.acceptQty.update((q) => ({ ...q, [itemId]: qty }));
    this.recomputeAdvance();
  }

  protected setMode(mode: PaymentMode): void {
    this.mode.set(mode);
    this.recomputeAdvance();
  }

  /** Suggested advance = shop default percent of the (possibly reduced) total. */
  private recomputeAdvance(): void {
    const pct = +(this.detail()?.shop.default_advance_percent ?? 0);
    this.advance.set(Math.round((this.acceptTotal() * pct) / 100));
  }

  protected accept(): Promise<void> {
    const d = this.detail()!;
    const items = d.items.map((i) => ({ id: i.id, qty: this.acceptQty()[i.id] ?? +i.qty_requested }));
    return this.run(() => this.orders.accept(d.order.id, items, this.mode(), this.advance(), this.remark()), 'orderAccepted');
  }

  protected reject(): Promise<void> {
    if (!this.remark().trim()) {
      this.toast.show('remarkRequired', 'warning');
      return Promise.resolve();
    }
    return this.run(() => this.orders.reject(this.id(), this.remark()), 'orderUpdated');
  }

  protected move(status: OrderStatus): Promise<void> {
    if (status === 'cancelled' && !confirm(this.config.label('orders.confirmCancel'))) return Promise.resolve();
    return this.run(() => this.orders.setStatus(this.id(), status, this.remark()), 'orderUpdated');
  }

  protected confirmPayment(): Promise<void> {
    return this.run(() => this.orders.confirmPayment(this.id(), this.received(), this.remark()), 'paymentConfirmed');
  }

  protected reportPaid(): Promise<void> {
    return this.run(() => this.orders.submitPayment(this.id(), this.payNow(), this.utr()), 'paymentReported');
  }

  protected cancel(): Promise<void> {
    if (!confirm(this.config.label('orders.confirmCancel'))) return Promise.resolve();
    return this.run(() => this.orders.cancel(this.id(), this.remark()), 'orderUpdated');
  }

  protected addNote(): Promise<void> {
    return this.run(async () => {
      await this.orders.remark(this.id(), this.note());
      this.note.set('');
    }, 'noteAdded');
  }

  protected statusLabel(status: OrderStatus): string {
    const o = this.detail()?.order;
    if (status === 'ready' && o) return this.config.label(`orderStatus.ready.${o.fulfilment}`);
    return this.config.label(`orderStatus.${status}`);
  }

  protected nextLabel(status: OrderStatus): string {
    const o = this.detail()?.order;
    if (status === 'ready' && o) return this.config.label(`orders.markReady.${o.fulfilment}`);
    return this.config.label(`orders.mark.${status}`);
  }

  protected statusClass(status: OrderStatus): string {
    return ORDER_STATUS_CLASS[status];
  }

  protected paymentClass(): string {
    const s = this.detail()?.order.payment_status;
    if (s === 'paid') return 'bg-success/15 text-success';
    if (s === 'pending_verification') return 'bg-info/15 text-info';
    if (s === 'partially_paid') return 'bg-warning/15 text-warning';
    return 'bg-muted/15 text-muted';
  }

  protected paymentTerms(): string {
    const o = this.detail()!.order;
    if (o.payment_mode === 'cod') return this.config.label('orders.terms.cod', { amount: this.config.money(this.balance()) });
    if (o.payment_mode === 'advance') {
      return this.config.label('orders.terms.advance', {
        amount: this.config.money(o.amount_due_now),
        balance: this.config.money(+o.total - +o.amount_due_now),
      });
    }
    return this.config.label('orders.terms.full', { amount: this.config.money(o.total) });
  }

  protected actorLabel(role: string): string {
    const mine = (role === 'shop') === this.isShop();
    return this.config.label(mine ? 'orders.byYou' : role === 'shop' ? 'orders.byShop' : 'orders.byCustomer');
  }

  protected time(value: string): string {
    return new Date(value).toLocaleString(this.config.get<string>('LOCALE'), { dateStyle: 'medium', timeStyle: 'short' });
  }
}

export const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  requested: 'bg-info/15 text-info',
  accepted: 'bg-primary/15 text-primary',
  packed: 'bg-warning/15 text-warning',
  ready: 'bg-success/15 text-success',
  completed: 'bg-success text-white',
  rejected: 'bg-error/15 text-error',
  cancelled: 'bg-muted/20 text-muted',
};
