import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService } from '../../core/services/config.service';
import { StoreService } from '../../core/services/store.service';
import { ToastService } from '../../core/services/toast.service';

/** /join: find a shop by its code or the shop's phone number. */
@Component({
  selector: 'app-join-page',
  template: `
    <div class="mx-auto max-w-sm pt-4 sm:pt-10">
      <form class="grid gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm" (submit)="$event.preventDefault(); find()">
        <div>
          <h1 class="text-2xl font-bold">{{ config.label('join.title') }}</h1>
          <p class="mt-1 text-sm text-muted">{{ config.label('join.hint') }}</p>
        </div>
        <input
          class="rounded-xl border border-border bg-background px-3 py-3 text-center text-lg font-semibold uppercase tracking-widest outline-none focus:border-primary"
          [placeholder]="config.label('join.placeholder')"
          autocapitalize="characters"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <button type="submit" class="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50" [disabled]="busy() || !query().trim()">
          {{ config.label(busy() ? 'common.loading' : 'join.find') }}
        </button>
      </form>
    </div>
  `,
})
export class JoinPage {
  protected readonly config = inject(ConfigService);
  private readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  protected readonly busy = signal(false);

  protected async find(): Promise<void> {
    this.busy.set(true);
    try {
      const slug = await this.store.find(this.query());
      if (slug) await this.router.navigate(['/s', slug]);
      else this.toast.show('shopNotFound', 'warning');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }
}
