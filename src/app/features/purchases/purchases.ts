import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import type { Html5Qrcode } from 'html5-qrcode';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ToastService } from '../../core/services/toast.service';
import { Row } from '../../core/types/models';
import { DataGrid } from '../../shared/data-grid/data-grid';
import { FieldDef, Option, OptionMap } from '../../shared/entity';
import { ImageRules, blobToBase64, compressImage } from '../../shared/image';

interface Item {
  name: string;
  qty: number;
  rate: number;
}

interface ScannerRules {
  fps?: number;
  qrbox?: number;
}

const FIELDS: FieldDef[] = [
  { key: 'purchase_date', type: 'date' },
  { key: 'vendor_id', type: 'select' },
  { key: 'total_price', type: 'money' },
];

@Component({
  selector: 'app-purchases',
  imports: [DataGrid],
  template: `
    <div class="mb-4 flex items-center justify-between gap-3">
      <h1 class="text-xl font-bold sm:text-2xl">{{ config.label('purchases.title') }}</h1>
      <button type="button" class="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-on-primary" (click)="openScan()">
        + {{ config.label('purchases.scan') }}
      </button>
    </div>

    <app-data-grid
      [fields]="fields"
      [rows]="rows()"
      labelPrefix="purchases"
      [options]="options()"
      [loading]="loading()"
      [editable]="false"
      (remove)="remove($event)"
    />

    @if (scanning()) {
      <div class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" (click)="closeScan()">
        <form
          class="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-xl sm:rounded-3xl sm:p-6"
          (click)="$event.stopPropagation()"
          (submit)="$event.preventDefault(); submit()"
        >
          <h2 class="mb-4 text-lg font-semibold">{{ config.label('purchases.scan') }}</h2>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">{{ config.label('purchases.vendor_id') }}</span>
              <select [class]="inputClass" (change)="vendorId.set($any($event.target).value)">
                <option value=""></option>
                @for (v of vendors(); track v.value) {
                  <option [value]="v.value">{{ v.label }}</option>
                }
              </select>
            </label>
            <label class="grid gap-1.5 text-sm">
              <span class="font-medium">{{ config.label('purchases.purchase_date') }}</span>
              <input type="date" [class]="inputClass" [value]="date()" (input)="date.set($any($event.target).value)" />
            </label>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="grid cursor-pointer place-items-center gap-1 rounded-2xl border-2 border-dashed border-border p-4 text-center text-sm hover:border-primary">
              <span class="font-medium">{{ config.label('purchases.photo') }}</span>
              <span class="text-xs text-muted">{{ photoName() || config.label('purchases.photoHint') }}</span>
              <input type="file" accept="image/*" capture="environment" class="hidden" (change)="pickPhoto($event)" />
            </label>
            <button type="button" class="rounded-2xl border-2 border-dashed border-border p-4 text-sm font-medium hover:border-primary" (click)="toggleQr()">
              {{ config.label(qrActive() ? 'purchases.stopQr' : 'purchases.scanQr') }}
              @if (qrText()) { <span class="block text-xs text-success">✓ {{ config.label('purchases.qrRead') }}</span> }
            </button>
          </div>
          <div id="qr-reader" class="mt-3 overflow-hidden rounded-2xl" [class.hidden]="!qrActive()"></div>

          <h3 class="mb-2 mt-5 text-sm font-semibold">{{ config.label('purchases.items') }}</h3>
          <div class="grid gap-2">
            @for (item of items(); track $index; let i = $index) {
              <div class="grid grid-cols-[1fr_4.5rem_5.5rem_auto] gap-2">
                <input [class]="inputClass" [placeholder]="config.label('purchases.itemName')" [value]="item.name" (input)="setItem(i, 'name', $any($event.target).value)" />
                <input type="number" step="any" [class]="inputClass" [placeholder]="config.label('purchases.itemQty')" [value]="item.qty" (input)="setItem(i, 'qty', $any($event.target).value)" />
                <input type="number" step="any" [class]="inputClass" [placeholder]="config.label('purchases.itemRate')" [value]="item.rate" (input)="setItem(i, 'rate', $any($event.target).value)" />
                <button type="button" class="px-2 text-error" [attr.aria-label]="config.label('common.delete')" (click)="removeItem(i)">&times;</button>
              </div>
            }
          </div>
          <div class="mt-2 flex items-center justify-between text-sm">
            <button type="button" class="font-medium text-info" (click)="addItem()">+ {{ config.label('purchases.addItem') }}</button>
            <span class="font-semibold">{{ config.label('purchases.subtotal') }}: {{ config.money(subtotal()) }}</span>
          </div>

          <div class="mt-6 flex gap-3">
            <button type="button" class="flex-1 rounded-xl border border-border px-4 py-3 font-medium" (click)="closeScan()">
              {{ config.label('common.cancel') }}
            </button>
            <button type="submit" class="flex-1 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary disabled:opacity-50" [disabled]="saving()">
              {{ config.label(saving() ? 'common.loading' : 'common.save') }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class Purchases implements OnDestroy {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly supabase = inject(SupabaseService);
  private readonly toast = inject(ToastService);

  protected readonly fields = FIELDS;
  protected readonly inputClass =
    'w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary';

  protected readonly rows = signal<Row[]>([]);
  protected readonly vendors = signal<Option[]>([]);
  protected readonly options = computed<OptionMap>(() => ({ vendor_id: this.vendors() }));
  protected readonly loading = signal(false);

  protected readonly scanning = signal(false);
  protected readonly saving = signal(false);
  protected readonly vendorId = signal('');
  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  protected readonly items = signal<Item[]>([]);
  protected readonly photo = signal<{ base64: string; type: string } | null>(null);
  protected readonly photoName = signal('');
  protected readonly qrText = signal('');
  protected readonly qrActive = signal(false);
  protected readonly subtotal = computed(() =>
    this.items().reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.rate || 0), 0),
  );

  private qr?: Html5Qrcode;

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    void this.stopQr();
  }

  private get shopId(): string | null {
    return this.auth.shop()?.id ?? null;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [rows, vendors] = await Promise.all([
        this.crud.list('vendor_purchases', { shop_id: this.shopId }, 'purchase_date.desc'),
        this.crud.list('vendors', { shop_id: this.shopId }, 'name'),
      ]);
      this.rows.set(rows);
      this.vendors.set(vendors.map((v) => ({ value: String(v['id']), label: String(v['name']) })));
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  protected openScan(): void {
    this.items.set([{ name: '', qty: 1, rate: 0 }]);
    this.photo.set(null);
    this.photoName.set('');
    this.qrText.set('');
    this.vendorId.set('');
    this.scanning.set(true);
  }

  protected async closeScan(): Promise<void> {
    await this.stopQr();
    this.scanning.set(false);
  }

  protected addItem(): void {
    this.items.update((list) => [...list, { name: '', qty: 1, rate: 0 }]);
  }

  protected removeItem(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
  }

  protected setItem(index: number, key: keyof Item, value: string): void {
    this.items.update((list) =>
      list.map((item, i) => (i === index ? { ...item, [key]: key === 'name' ? value : Number(value) } : item)),
    );
  }

  protected async pickPhoto(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.photoName.set(file.name);
    this.photo.set(await this.compress(file));
  }

  /** Downscales per app_settings BILL_IMAGE { max_px, quality } before upload. */
  private async compress(file: File): Promise<{ base64: string; type: string }> {
    const blob = await compressImage(file, this.config.get<ImageRules>('BILL_IMAGE'));
    return { base64: await blobToBase64(blob), type: 'image/jpeg' };
  }

  protected async toggleQr(): Promise<void> {
    if (this.qrActive()) {
      await this.stopQr();
      return;
    }
    const { Html5Qrcode } = await import('html5-qrcode');
    this.qrActive.set(true);
    const rules = this.config.get<ScannerRules>('QR_SCANNER') ?? {};
    this.qr = new Html5Qrcode('qr-reader');
    try {
      await this.qr.start(
        { facingMode: 'environment' },
        { fps: rules.fps ?? 10, qrbox: rules.qrbox },
        (text) => {
          this.qrText.set(text);
          this.applyQrItems(text);
          this.toast.show('qrRead', 'success');
          void this.stopQr();
        },
        () => undefined,
      );
    } catch (err) {
      this.qrActive.set(false);
      this.toast.error(err);
    }
  }

  /** A QR with a JSON items list pre-fills the editor; the server parses it again. */
  private applyQrItems(text: string): void {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed?.items;
      if (Array.isArray(list) && list.length) this.items.set(list);
    } catch {
      // Not structured; stored as scanned_data.qr_text only.
    }
  }

  private async stopQr(): Promise<void> {
    if (this.qr?.isScanning) await this.qr.stop();
    this.qr?.clear();
    this.qr = undefined;
    this.qrActive.set(false);
  }

  protected async submit(): Promise<void> {
    const shopId = this.shopId;
    if (!shopId) return;
    this.saving.set(true);
    try {
      await this.supabase.invoke('vendor-scan', {
        shop_id: shopId,
        vendor_id: this.vendorId() || null,
        purchase_date: this.date(),
        image_base64: this.photo()?.base64,
        content_type: this.photo()?.type,
        qr_text: this.qrText() || undefined,
        items: this.items().filter((i) => i.name.trim()),
      });
      this.toast.show('scanSaved', 'success');
      await this.closeScan();
      await this.load();
    } catch (err) {
      this.toast.show('scanFailed', 'error');
      console.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: Row): Promise<void> {
    if (!confirm(this.config.label('common.confirmDelete'))) return;
    try {
      await this.crud.remove('vendor_purchases', String(row['id']));
      this.toast.show('deleted', 'success');
      await this.load();
    } catch (err) {
      this.toast.error(err);
    }
  }
}
