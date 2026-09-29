import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { CrudService } from '../../core/services/crud.service';
import { ToastService } from '../../core/services/toast.service';
import { Row } from '../../core/types/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="rounded-2xl bg-primary px-5 py-7 text-on-primary shadow-sm sm:px-8 sm:py-10">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ config.label('home.greeting', { name: auth.displayName() }) }}
      </h1>
      @if (auth.shop(); as shop) {
        <p class="mt-1 text-lg font-medium opacity-90">{{ shop.name }}</p>
        @if (planName() || shop.subscription_expires_at) {
          <p class="mt-3 inline-flex flex-wrap gap-x-2 rounded-full bg-black/10 px-3 py-1 text-sm">
            <span>{{ planName() }}</span>
            @if (shop.subscription_expires_at) {
              <span>· {{ config.label('home.validTill', { date: config.date(shop.subscription_expires_at) }) }}</span>
            }
          </p>
        }
      }
    </section>

    @if (auth.shop()) {
      <section class="mt-5 grid grid-cols-3 gap-3">
        @for (stat of stats(); track stat.key) {
          <a [routerLink]="stat.link" class="rounded-2xl border border-border bg-surface p-4 hover:border-primary">
            <p class="text-2xl font-bold sm:text-3xl" [class.text-error]="stat.alert && stat.value > 0">{{ stat.value }}</p>
            <p class="mt-1 text-xs text-muted sm:text-sm">{{ config.label(stat.key) }}</p>
          </a>
        }
      </section>

      <section class="mt-5 rounded-2xl border border-border bg-surface p-5">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">{{ config.label('home.lowStock') }}</h2>
          <a routerLink="/reminders" class="text-sm font-medium text-info">{{ config.label('common.viewAll') }}</a>
        </div>
        @if (unread().length === 0) {
          <p class="mt-3 text-sm text-muted">{{ config.label('home.noReminders') }}</p>
        } @else {
          <ul class="mt-3 grid gap-2">
            @for (r of unread().slice(0, 5); track r['id']) {
              <li class="flex items-start justify-between gap-3 rounded-xl bg-background px-3 py-2.5 text-sm">
                <span>{{ r['message'] }}</span>
                <button type="button" class="shrink-0 text-xs font-medium text-info" (click)="markRead(r)">
                  {{ config.label('reminders.markRead') }}
                </button>
              </li>
            }
          </ul>
        }
      </section>
    } @else if (!auth.can('can_access_admin')) {
      <a routerLink="/onboarding" class="mt-5 block rounded-2xl border border-border bg-surface p-5 font-medium">
        {{ config.label('home.createShop') }}
      </a>
    }

    <section class="mt-5 grid gap-3 sm:grid-cols-2">
      @if (whatsappUrl(); as url) {
        <a [href]="url" target="_blank" rel="noopener" class="rounded-2xl border border-border bg-surface p-5 font-medium hover:border-success">
          {{ config.label('home.whatsappSupport') }}
        </a>
      }
      <a routerLink="/support" class="rounded-2xl border border-border bg-surface p-5 font-medium hover:border-primary">
        {{ config.label('home.raiseTicket') }}
      </a>
    </section>
  `,
})
export class Home {
  protected readonly config = inject(ConfigService);
  protected readonly auth = inject(AuthService);
  private readonly crud = inject(CrudService);
  private readonly toast = inject(ToastService);

  private readonly counts = signal({ stocks: 0, vendors: 0 });
  protected readonly unread = signal<Row[]>([]);
  protected readonly planName = signal('');

  protected readonly stats = computed(() => [
    { key: 'home.stocks', value: this.counts().stocks, link: '/stocks', alert: false },
    { key: 'home.lowStockCount', value: this.unread().length, link: '/reminders', alert: true },
    { key: 'home.vendors', value: this.counts().vendors, link: '/vendors', alert: false },
  ]);

  protected readonly whatsappUrl = computed(() => {
    const number = (this.config.get<string>('SUPPORT_WHATSAPP_NUMBER') ?? '').replace(/\D/g, '');
    return number ? `https://wa.me/${number}` : null;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const shop = this.auth.shop();
    if (!shop) return;
    try {
      const [stocks, vendors, reminders, plans] = await Promise.all([
        this.crud.list('stocks', { shop_id: shop.id }),
        this.crud.list('vendors', { shop_id: shop.id }),
        this.crud.list('stock_reminders', { shop_id: shop.id, is_read: false }, 'reminder_date.desc'),
        shop.subscription_plan_id
          ? this.crud.list('pricing_plans', { id: shop.subscription_plan_id })
          : Promise.resolve([]),
      ]);
      this.counts.set({ stocks: stocks.length, vendors: vendors.length });
      this.unread.set(reminders);
      this.planName.set(String(plans[0]?.['name'] ?? ''));
    } catch (err) {
      this.toast.error(err);
    }
  }

  protected async markRead(reminder: Row): Promise<void> {
    try {
      await this.crud.update('stock_reminders', String(reminder['id']), { is_read: true });
      this.unread.update((list) => list.filter((r) => r['id'] !== reminder['id']));
    } catch (err) {
      this.toast.error(err);
    }
  }
}
