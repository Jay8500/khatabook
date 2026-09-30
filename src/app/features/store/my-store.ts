import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService, format } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { whatsappLink } from '../../core/services/orders.service';
import { ToastService } from '../../core/services/toast.service';
import { PaymentMode } from '../../core/types/store';
import { qrDataUrl } from '../../shared/qr';
import { SupabaseService } from '../../core/services/supabase.service';

interface Closure {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
}

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

    @if (closure()?.status === 'approved') {
      <section class="mt-5 rounded-2xl border border-error/40 bg-error/10 p-4 text-sm">
        <h2 class="font-semibold text-error">{{ config.label('myStore.closedTitle') }}</h2>
        <p class="mt-1">{{ config.label('myStore.closedHint', { date: config.date(closure()!.decided_at ?? '') }) }}</p>
        @if (closure()!.admin_note) {
          <p class="mt-2 rounded-lg bg-surface px-3 py-2">{{ closure()!.admin_note }}</p>
        }
      </section>
    } @else if (shop(); as s) {
      <!-- Share -->
      <section class="mt-5 rounded-2xl border-2 border-primary bg-surface p-4">
        <h2 class="font-semibold">{{ config.label('myStore.shareTitle') }}</h2>
        <p class="mt-2 break-all rounded-xl bg-background px-3 py-2 font-mono text-sm">{{ link() }}</p>
        <p class="mt-2 text-sm">{{ config.label('myStore.code') }}: <b class="font-mono text-lg tracking-widest">{{ s['join_code'] }}</b></p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium" (click)="copy()">{{ config.label('myStore.copy') }}</button>
          <a [href]="shareWhatsapp()" target="_blank" rel="noopener" class="rounded-xl bg-success px-3 py-2.5 text-center text-sm font-semibold text-white">{{ config.label('myStore.shareWhatsapp') }}</a>
        </div>
        @if (poster()) {
          <div class="mt-4 text-center">
            <img [src]="poster()" alt="" class="mx-auto w-56 rounded-2xl border border-border shadow-sm" />
            <div class="mx-auto mt-3 grid max-w-xs grid-cols-2 gap-2">
              <button type="button" class="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-on-primary" (click)="shareQr()">{{ config.label('myStore.shareQr') }}</button>
              <a [href]="poster()" [attr.download]="s['slug'] + '-qr.png'" class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium">{{ config.label('myStore.downloadQr') }}</a>
            </div>
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

      <!-- Close my shop: a request to the platform admin, who settles and approves -->
      <section class="mt-8 rounded-2xl border border-error/30 bg-surface p-4 text-sm">
        <h2 class="font-semibold text-error">{{ config.label('myStore.closeTitle') }}</h2>
        @if (closure()?.status === 'pending') {
          <p class="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-warning">
            {{ config.label('myStore.closePending', { date: config.date(closure()!.created_at) }) }}
          </p>
          <button type="button" class="mt-3 w-full rounded-xl border border-border px-4 py-2.5 font-medium disabled:opacity-50" [disabled]="closing()" (click)="withdrawClosure()">
            {{ config.label('myStore.closeWithdraw') }}
          </button>
        } @else {
          @if (closure()?.status === 'rejected') {
            <p class="mt-2 rounded-xl bg-background px-3 py-2">
              {{ config.label('myStore.closeRejected') }}@if (closure()!.admin_note) {: {{ closure()!.admin_note }}}
            </p>
          }
          <p class="mt-1 text-muted">{{ config.label('myStore.closeHint') }}</p>
          @if (closeOpen()) {
            <textarea
              rows="2"
              [class]="inputClass"
              [placeholder]="config.label('myStore.closeReason')"
              [value]="closeReason()"
              (input)="closeReason.set($any($event.target).value)"
            ></textarea>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button type="button" class="rounded-xl border border-border px-4 py-2.5 font-medium" (click)="closeOpen.set(false)">{{ config.label('common.cancel') }}</button>
              <button type="button" class="rounded-xl bg-error px-4 py-2.5 font-semibold text-white disabled:opacity-50" [disabled]="closing()" (click)="requestClosure()">
                {{ config.label('myStore.closeSend') }}
              </button>
            </div>
          } @else {
            <button type="button" class="mt-3 w-full rounded-xl border border-error/40 px-4 py-2.5 font-medium text-error" (click)="closeOpen.set(true)">
              {{ config.label('myStore.closeButton') }}
            </button>
          }
        }
      </section>
    }
  `,
})
export class MyStore {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);
  private readonly supabase = inject(SupabaseService);

  protected readonly modes: PaymentMode[] = ['full', 'advance', 'cod'];
  protected readonly inputClass =
    'mt-1 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary';
  protected readonly labelClass = 'grid text-sm font-medium';

  protected readonly shop = computed(() => this.auth.shop() as unknown as Record<string, unknown> | null);
  protected readonly form = signal<StoreForm>(this.toForm());
  protected readonly busy = signal(false);
  protected readonly poster = signal<string | null>(null);
  protected readonly closure = signal<Closure | null>(null);
  protected readonly closeOpen = signal(false);
  protected readonly closeReason = signal('');
  protected readonly closing = signal(false);

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
    void this.loadClosure();
  }

  private async loadClosure(): Promise<void> {
    try {
      this.closure.set(await this.supabase.callSecureRpc<Closure | null>('my_shop_closure'));
    } catch {
      // Only needed for the close section.
    }
  }

  protected async requestClosure(): Promise<void> {
    if (!confirm(this.config.label('myStore.closeConfirm', { shop: this.shop()?.['name'] }))) return;
    this.closing.set(true);
    try {
      await this.supabase.callSecureRpc('request_shop_closure', { p_reason: this.closeReason() });
      this.closeOpen.set(false);
      this.closeReason.set('');
      this.toast.show('closureRequested', 'success');
      await this.loadClosure();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.closing.set(false);
    }
  }

  protected async withdrawClosure(): Promise<void> {
    this.closing.set(true);
    try {
      await this.supabase.callSecureRpc('withdraw_shop_closure');
      this.toast.show('closureWithdrawn', 'success');
      await this.loadClosure();
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.closing.set(false);
    }
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

  /** Printable / shareable card: shop name, QR, "Scan to order", shop code. Colours from THEME_COLORS. */
  private async makeQr(): Promise<void> {
    const shop = this.shop();
    if (!shop) return;
    const qr = new Image();
    qr.src = await qrDataUrl(this.link(), 720);
    await qr.decode();

    const colors = this.config.get<{ light: Record<string, string> }>('THEME_COLORS')?.light ?? {};
    const primary = colors['primary'] ?? '#000';
    const onPrimary = colors['onPrimary'] ?? '#fff';
    const text = colors['text'] ?? '#000';
    const muted = colors['muted'] ?? '#666';

    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1400;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = primary;
    g.fillRect(0, 0, c.width, 260);
    g.textAlign = 'center';
    g.fillStyle = onPrimary;
    g.font = 'bold 72px system-ui, sans-serif';
    g.fillText(String(shop['name'] ?? ''), c.width / 2, 150, c.width - 80);
    g.font = '36px system-ui, sans-serif';
    g.fillText(this.config.label('myStore.qrTagline'), c.width / 2, 215, c.width - 80);
    g.drawImage(qr, 180, 320, 720, 720);
    g.fillStyle = text;
    g.font = 'bold 56px system-ui, sans-serif';
    g.fillText(this.config.label('myStore.qrTitle'), c.width / 2, 1130);
    g.fillStyle = muted;
    g.font = '40px system-ui, sans-serif';
    g.fillText(this.config.label('myStore.qrCode', { code: shop['join_code'] }), c.width / 2, 1200);
    g.font = '30px system-ui, sans-serif';
    g.fillText(this.link().replace(/^https?:\/\//, ''), c.width / 2, 1260, c.width - 80);
    const brand = this.config.brand();
    if (brand) g.fillText(`${this.config.label('footer.poweredBy')} ${brand.name}`, c.width / 2, 1350);
    this.poster.set(c.toDataURL('image/png'));
  }

  /** Phone share sheet with the card image (WhatsApp, Instagram…); download elsewhere. */
  protected async shareQr(): Promise<void> {
    const url = this.poster();
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `${this.shop()?.['slug']}-qr.png`, { type: 'image/png' });
    const text = format(this.config.label('myStore.shareText'), {
      shop: this.shop()?.['name'],
      link: this.link(),
      code: this.shop()?.['join_code'],
    });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
      } catch {
        // Share sheet closed.
      }
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
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
