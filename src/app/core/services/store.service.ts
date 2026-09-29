import { Injectable, computed, inject, signal } from '@angular/core';
import { Fulfilment, Store, StoreItem } from '../types/store';
import { SupabaseService } from './supabase.service';

export interface CartLine {
  item: StoreItem;
  qty: number;
}

const CART_KEY = (slug: string) => `khata.cart.${slug}`;

/**
 * Customer side of a shop's store: public catalog, joining, and a per-shop cart that
 * survives reloads (browser storage is only a convenience; the order itself is server-side).
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly supabase = inject(SupabaseService);

  private readonly _store = signal<Store | null>(null);
  private readonly _cart = signal<CartLine[]>([]);
  readonly store = this._store.asReadonly();
  readonly cart = this._cart.asReadonly();

  readonly cartCount = computed(() => this._cart().reduce((n, l) => n + l.qty, 0));
  readonly cartLines = computed(() => this._cart().length);
  readonly subtotal = computed(() => this._cart().reduce((sum, l) => sum + l.qty * l.item.price, 0));

  /** Public, read-only catalog: called without encryption so visitors can browse before login. */
  async load(slug: string): Promise<Store | null> {
    const { data, error } = await this.supabase.requireClient().rpc('store_get', { p_slug: slug });
    if (error) throw error;
    const store = (data as Store | null) ?? null;
    this._store.set(store);
    this.restoreCart(slug, store?.items ?? []);
    return store;
  }

  /** Join code or owner / shop phone -> store slug. */
  async find(query: string): Promise<string | null> {
    const { data, error } = await this.supabase.requireClient().rpc('store_find', { p_query: query });
    if (error) throw error;
    return (data as string | null) ?? null;
  }

  join(shopId: string): Promise<unknown> {
    return this.supabase.callSecureRpc('store_join', { p_shop_id: shopId });
  }

  myShops(): Promise<{ id: string; name: string; slug: string }[]> {
    return this.supabase.callSecureRpc('my_shops');
  }

  qtyOf(itemId: string): number {
    return this._cart().find((l) => l.item.id === itemId)?.qty ?? 0;
  }

  /** Sets a line's quantity (0 removes it), never above what is available. */
  setQty(item: StoreItem, qty: number): void {
    const next = Math.max(0, Math.min(qty, Number(item.available)));
    this._cart.update((lines) => {
      const others = lines.filter((l) => l.item.id !== item.id);
      if (next === 0) return others;
      const existing = lines.find((l) => l.item.id === item.id);
      return existing
        ? lines.map((l) => (l.item.id === item.id ? { ...l, qty: next } : l))
        : [...lines, { item, qty: next }];
    });
    this.saveCart();
  }

  clearCart(): void {
    this._cart.set([]);
    this.saveCart();
  }

  placeOrder(fulfilment: Fulfilment, address: string, note: string): Promise<string> {
    const shop = this._store()!.shop;
    return this.supabase.callSecureRpc<string>('order_place', {
      p_shop_id: shop.id,
      p_items: this._cart().map((l) => ({ stock_id: l.item.id, qty: l.qty })),
      p_fulfilment: fulfilment,
      p_address: address,
      p_note: note,
    });
  }

  private saveCart(): void {
    const slug = this._store()?.shop.slug;
    if (!slug) return;
    try {
      localStorage.setItem(CART_KEY(slug), JSON.stringify(this._cart().map((l) => ({ id: l.item.id, qty: l.qty }))));
    } catch {
      // Storage unavailable (private mode): the cart still works for this visit.
    }
  }

  /** Re-attach saved lines to fresh items (prices/availability may have changed). */
  private restoreCart(slug: string, items: StoreItem[]): void {
    let saved: { id: string; qty: number }[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(CART_KEY(slug)) ?? '[]');
    } catch {
      saved = [];
    }
    const lines: CartLine[] = [];
    for (const s of saved) {
      const item = items.find((i) => i.id === s.id);
      const qty = Math.min(s.qty, Number(item?.available ?? 0));
      if (item && qty > 0) lines.push({ item, qty });
    }
    this._cart.set(lines);
  }
}
