import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService, format } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { whatsappLink } from '../../core/services/orders.service';
import { ToastService } from '../../core/services/toast.service';
import { PaymentMode } from '../../core/types/store';

interface StoreForm {
  name: string;
  slug: string;
  store_enabled: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_charge: number;
  delivery_note: string;
  min_order_amount: number;
  upi_id: string;
  upi_name: string;
  default_payment_mode: PaymentMode;
  default_advance_percent: number;
  address: string;
  contact_phone: string;
  store_note: string;
}

/** /my-store: the shop owner's store link and store rules. */
@Component({
  selector: 'app-my-store',
  template: `
    <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('myStore.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ config.label('myStore.hint') }}</p>

    @if (shop(); as s) {
      <!-- Share -->
      <section class="mt-5 rounded-2xl border-2 border-primary bg-surface p-4">
        <h2 class="font-semibold">{{ config.label('myStore.shareTitle') }}</h2>
        <p class="mt-2 break-all rounded-xl bg-background px-3 py-2 font-mono text-sm">{{ link() }}</p>
        <p class="mt-2 text-sm">{{ config.label('myStore.code') }}: <b class="font-mono text-lg tracking-widest">{{ s['join_code'] }}</b></p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium" (click)="copy()">{{ config.label('myStore.copy') }}</button>
          <a [href]="shareWhatsapp()" target="_blank" rel="noopener" class="rounded-xl bg-success px-3 py-2.5 text-center text-sm font-semibold text-white">{{ config.label('myStore.shareWhatsapp') }}</a>
        </div>
        @if (qr()) {
          <div class="mt-4 text-center">
            <img [src]="qr()" alt="" class="mx-auto size-48 rounded-xl border border-border bg-white p-2" />
            <a [href]="qr()" [attr.download]="s['slug'] + '-qr.png'" class="mt-2 inline-block text-sm font-medium text-primary">{{ config.label('myStore.downloadQr') }}</a>
          </div>
        }
      </section>

      <form class="mt-5 grid gap-4" (submit)="$event.preventDefault(); save()">
        <section class="grid gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 class="font-semibold">{{ config.label('myStore.basics') }}</h2>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span><b>{{ config.label('myStore.open') }}</b><br /><span class="text-xs text-muted">{{ config.label('myStore.openHint') }}</span></span>
            <input type="checkbox" class="size-6 accent-primary" [checked]="form().store_enabled" (change)="set('store_enabled', $any($event.target).checked)" />
          </label>
          <label [class]="labelClass">{{ config.label('myStore.name') }}<input [class]="inputClass" [value]="form().name" (input)="set('name', $any($event.target).value)" /></label>
          <label [class]="labelClass">{{ config.label('myStore.slug') }}<input [class]="inputClass" [value]="form().slug" (input)="set('slug', $any($event.target).value)" /></label>
          <label [class]="labelClass">{{ config.label('myStore.note') }}<input [class]="inputClass" [placeholder]="config.label('myStore.notePlaceholder')" [value]="form().store_note" (input)="set('store_note', $any($event.target).value)" /></label>
          <label [class]="labelClass">{{ config.label('myStore.address') }}<textarea rows="2" [class]="inputClass" [value]="form().address" (input)="set('address', $any($event.target).value)"></textarea></label>
          <label [class]="labelClass">{{ config.label('myStore.phone') }}<input type="tel" [class]="inputClass" [value]="form().contact_phone" (input)="set('contact_phone', $any($event.target).value)" /></label>
        </section>

        <section class="grid gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 class="font-semibold">{{ config.label('myStore.fulfilment') }}</h2>
          <label class="flex items-center justify-between text-sm"><b>{{ config.label('store.pickup') }}</b>
            <input type="checkbox" class="size-6 accent-primary" [checked]="form().pickup_enabled" (change)="set('pickup_enabled', $any($event.target).checked)" />
          </label>
          <label class="flex items-center justify-between text-sm"><b>{{ config.label('store.delivery') }}</b>
            <input type="checkbox" class="size-6 accent-primary" [checked]="form().delivery_enabled" (change)="set('delivery_enabled', $any($event.target).checked)" />
          </label>
          @if (form().delivery_enabled) {
            <label [class]="labelClass">{{ config.label('myStore.deliveryCharge') }}<input type="number" min="0" [class]="inputClass" [value]="form().delivery_charge" (input)="set('delivery_charge', +$any($event.target).value)" /></label>
            <label [class]="labelClass">{{ config.label('myStore.deliveryNote') }}<input [class]="inputClass" [placeholder]="config.label('myStore.deliveryNotePlaceholder')" [value]="form().delivery_note" (input)="set('delivery_note', $any($event.target).value)" /></label>
          }
          <label [class]="labelClass">{{ config.label('myStore.minOrder') }}<input type="number" min="0" [class]="inputClass" [value]="form().min_order_amount" (input)="set('min_order_amount', +$any($event.target).value)" /></label>
        </section>

        <section class="grid gap-3 rounded-2xl border border-border bg-surface p-4">
          <h2 class="font-semibold">{{ config.label('myStore.payments') }}</h2>
          <label [class]="labelClass">{{ config.label('myStore.upiId') }}<input [class]="inputClass" placeholder="shop@upi" [value]="form().upi_id" (input)="set('upi_id', $any($event.target).value)" /></label>
          <label [class]="labelClass">{{ config.label('myStore.upiName') }}<input [class]="inputClass" [value]="form().upi_name" (input)="set('upi_name', $any($event.target).value)" /></label>
          <p class="text-sm">{{ config.label('myStore.defaultPayment') }}</p>
          <div class="grid grid-cols-3 gap-2">
            @for (m of modes; track m) {
              <button type="button" class="rounded-xl border-2 px-2 py-2.5 text-xs font-semibold" [class]="form().default_payment_mode === m ? 'border-primary bg-primary/10' : 'border-border'" (click)="set('default_payment_mode', m)">
                {{ config.label('paymentMode.' + m) }}
              </button>
            }
          </div>
          @if (form().default_payment_mode === 'advance') {
            <label [class]="labelClass">{{ config.label('myStore.advancePercent') }}<input type="number" min="0" max="100" [class]="inputClass" [value]="form().default_advance_percent" (input)="set('default_advance_percent', +$any($event.target).value)" /></label>
          }
        </section>

        <button type="submit" class="sticky bottom-24 rounded-xl bg-primary px-4 py-3.5 font-semibold text-on-primary shadow-lg disabled:opacity-50 md:bottom-4" [disabled]="busy()">
          {{ config.label(busy() ? 'common.loading' : 'common.save') }}
        </button>
      </form>
    }
  `,
})
export class MyStore {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  protected readonly modes: PaymentMode[] = ['full', 'advance', 'cod'];
  protected readonly inputClass =
    'mt-1 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary';
  protected readonly labelClass = 'grid text-sm font-medium';

  protected readonly shop = computed(() => this.auth.shop() as unknown as Record<string, unknown> | null);
  protected readonly form = signal<StoreForm>(this.toForm());
  protected readonly busy = signal(false);
  protected readonly qr = signal<string | null>(null);

  protected readonly link = computed(() => `${location.origin}/s/${this.shop()?.['slug'] ?? ''}`);
  protected readonly shareWhatsapp = computed(() => {
    const text = format(this.config.label('myStore.shareText'), {
      shop: this.shop()?.['name'],
      link: this.link(),
      code: this.shop()?.['join_code'],
    });
    return whatsappLink('', text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
  });

  constructor() {
    void this.makeQr();
  }

  private toForm(): StoreForm {
    const s = (this.auth.shop() ?? {}) as unknown as Record<string, unknown>;
    const text = (k: string) => String(s[k] ?? '');
    const num = (k: string) => Number(s[k] ?? 0);
    return {
      name: text('name'),
      slug: text('slug'),
      store_enabled: s['store_enabled'] !== false,
      pickup_enabled: !!s['pickup_enabled'],
      delivery_enabled: !!s['delivery_enabled'],
      delivery_charge: num('delivery_charge'),
      delivery_note: text('delivery_note'),
      min_order_amount: num('min_order_amount'),
      upi_id: text('upi_id'),
      upi_name: text('upi_name'),
      default_payment_mode: (s['default_payment_mode'] as PaymentMode) ?? 'full',
      default_advance_percent: num('default_advance_percent'),
      address: text('address'),
      contact_phone: text('contact_phone'),
      store_note: text('store_note'),
    };
  }

  protected set<K extends keyof StoreForm>(key: K, value: StoreForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  private async makeQr(): Promise<void> {
    if (!this.shop()) return;
    const { toDataURL } = await import('qrcode');
    this.qr.set(await toDataURL(this.link(), { margin: 1, width: 360 }));
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.link());
    this.toast.show('linkCopied', 'success');
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f.pickup_enabled && !f.delivery_enabled) {
      this.toast.show('pickOneFulfilment', 'warning');
      return;
    }
    this.busy.set(true);
    try {
      const empty = (v: string) => (v.trim() === '' ? null : v.trim());
      await this.crud.update('shops', String(this.shop()!['id']), {
        ...f,
        name: f.name.trim(),
        slug: f.slug.trim(),
        delivery_note: empty(f.delivery_note),
        upi_id: empty(f.upi_id),
        upi_name: empty(f.upi_name),
        address: empty(f.address),
        contact_phone: empty(f.contact_phone),
        store_note: empty(f.store_note),
      });
      await this.auth.loadContext();
      this.form.set(this.toForm());
      await this.makeQr();
      this.toast.show('saved', 'success');
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg.includes('shops_slug_key')) this.toast.show('slugTaken', 'warning');
      else this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
