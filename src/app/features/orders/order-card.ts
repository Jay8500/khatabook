import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { Order } from '../../core/types/store';
import { ORDER_STATUS_CLASS } from './order-detail';

/** One order in a list; `who` is the shop name (customer view) or customer name (shop view). */
@Component({
  selector: 'app-order-card',
  imports: [RouterLink],
  template: `
    <a [routerLink]="['/orders', order().id]" class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 hover:border-primary">
      <span class="min-w-0">
        <span class="block font-semibold">{{ config.label('orders.orderNo', { no: order().order_no }) }} · {{ who() }}</span>
        <span class="block text-xs text-muted">{{ when() }} · {{ config.label('store.' + order().fulfilment) }}</span>
        @if (order().payment_mode) {
          <span class="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" [class]="paymentClass()">
            {{ config.label('paymentStatus.' + order().payment_status) }}
          </span>
        }
      </span>
      <span class="shrink-0 text-right">
        <span class="block font-bold">{{ config.money(order().total) }}</span>
        <span class="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold" [class]="statusClass()">{{ statusLabel() }}</span>
      </span>
    </a>
  `,
})
export class OrderCard {
  protected readonly config = inject(ConfigService);
  readonly order = input.required<Order>();
  readonly who = input('');

  protected statusClass(): string {
    return ORDER_STATUS_CLASS[this.order().status];
  }

  /** "30 Sept 2026, 4:05 pm" */
  protected when(): string {
    return new Date(this.order().created_at).toLocaleString(this.config.get<string>('LOCALE'), { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected paymentClass(): string {
    const s = this.order().payment_status;
    if (s === 'paid') return 'bg-success/15 text-success';
    if (s === 'pending_verification') return 'bg-info/15 text-info';
    if (s === 'partially_paid') return 'bg-warning/15 text-warning';
    return 'bg-muted/15 text-muted';
  }

  protected statusLabel(): string {
    const o = this.order();
    return this.config.label(o.status === 'ready' ? `orderStatus.ready.${o.fulfilment}` : `orderStatus.${o.status}`);
  }
}
