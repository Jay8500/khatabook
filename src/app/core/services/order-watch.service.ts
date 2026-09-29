import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { OrdersService } from './orders.service';
import { ToastService } from './toast.service';

/** Shop side: count of new order requests (Orders badge) and an alert when one arrives. */
@Injectable({ providedIn: 'root' })
export class OrderWatchService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  private readonly orders = inject(OrdersService);
  private readonly toast = inject(ToastService);

  private readonly _requested = signal(0);
  readonly requested = this._requested.asReadonly();
  private timer?: ReturnType<typeof setInterval>;
  private last: number | null = null;

  constructor() {
    effect(() => {
      const active = this.auth.can('can_manage_own_shop') && !!this.auth.shop();
      clearInterval(this.timer);
      this.last = null;
      this._requested.set(0);
      if (!active) return;
      const seconds = this.config.get<number>('ORDER_POLL_SECONDS') ?? 20;
      void this.check();
      this.timer = setInterval(() => void this.check(), seconds * 1000);
    });
  }

  private async check(): Promise<void> {
    if (document.visibilityState !== 'visible') return;
    try {
      const n = (await this.orders.counts()).requested ?? 0;
      if (this.last !== null && n > this.last && !location.pathname.startsWith('/shop-orders')) {
        this.toast.show('newOrder', 'info', { count: n }, undefined, true);
        navigator.vibrate?.([200, 100, 200]);
      }
      this.last = n;
      this._requested.set(n);
    } catch {
      // Try again on the next tick.
    }
  }
}
