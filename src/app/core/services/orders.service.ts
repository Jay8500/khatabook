import { Injectable, inject } from '@angular/core';
import { OrderDetail, OrderStatus, PaymentMode } from '../types/store';
import { SupabaseService } from './supabase.service';

/** Order actions; every rule (who may do what, stock, totals) is enforced in the database. */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly supabase = inject(SupabaseService);

  get(id: string): Promise<OrderDetail | null> {
    return this.supabase.callSecureRpc('order_get', { p_order_id: id });
  }

  counts(): Promise<Partial<Record<OrderStatus, number>>> {
    return this.supabase.callSecureRpc('shop_order_counts');
  }

  // Customer
  cancel(id: string, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_cancel', { p_order_id: id, p_remark: remark });
  }

  submitPayment(id: string, amount: number, reference: string): Promise<void> {
    return this.supabase.callSecureRpc('order_submit_payment', { p_order_id: id, p_amount: amount, p_reference: reference });
  }

  remark(id: string, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_remark', { p_order_id: id, p_remark: remark });
  }

  // Shop
  accept(id: string, items: { id: string; qty: number }[], mode: PaymentMode, advance: number, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_accept', {
      p_order_id: id,
      p_items: items,
      p_payment_mode: mode,
      p_advance: advance,
      p_remark: remark,
    });
  }

  reject(id: string, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_reject', { p_order_id: id, p_remark: remark });
  }

  setStatus(id: string, status: OrderStatus, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_set_status', { p_order_id: id, p_status: status, p_remark: remark });
  }

  confirmPayment(id: string, amount: number, remark: string): Promise<void> {
    return this.supabase.callSecureRpc('order_confirm_payment', { p_order_id: id, p_amount: amount, p_remark: remark });
  }
}

/** What a shop can move an order to next (mirrors order_set_status). */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  accepted: ['packed', 'ready', 'cancelled'],
  packed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
};

/** UPI deep link that opens GPay / PhonePe / Paytm with the amount filled in. */
export function upiLink(upiId: string, name: string, amount: number, note: string): string {
  const params = new URLSearchParams({ pa: upiId, pn: name, am: amount.toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${params.toString()}`;
}

/** wa.me link for an Indian or international number in any format. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
