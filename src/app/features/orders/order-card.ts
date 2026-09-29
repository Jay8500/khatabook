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
        <span class="text-xs text-muted">
          {{ config.date(order().created_at) }} · {{ config.label('store.' + order().fulfilment) }}
          @if (order().payment_status === 'pending_verification') {
            · <b class="text-info">{{ config.label('paymentStatus.pending_verification') }}</b>
          }
        </span>
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

  protected statusLabel(): string {
    const o = this.order();
    return this.config.label(o.status === 'ready' ? `orderStatus.ready.${o.fulfilment}` : `orderStatus.${o.status}`);
  }
}
