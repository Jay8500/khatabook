import { Component, inject } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { NetworkService } from '../../core/services/network.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-home',
  template: `
    <section class="rounded-2xl bg-primary px-6 py-10 text-on-primary shadow-sm">
      <h1 class="text-3xl font-bold tracking-tight">{{ config.label('home.title') }}</h1>
      <p class="mt-2 max-w-prose opacity-80">{{ config.label('home.subtitle') }}</p>
    </section>

    <section class="mt-6 rounded-2xl border border-border bg-surface p-6">
      <h2 class="text-lg font-semibold">{{ config.label('home.status') }}</h2>
      <dl class="mt-4 grid gap-4 sm:grid-cols-2">
        <div class="rounded-xl bg-background p-4">
          <dt class="text-xs uppercase tracking-wide text-muted">{{ config.label('home.configSource') }}</dt>
          <dd class="mt-1 font-medium">{{ config.label('home.configSource.' + config.source()) }}</dd>
        </div>
        <div class="rounded-xl bg-background p-4">
          <dt class="text-xs uppercase tracking-wide text-muted">{{ config.label('home.network') }}</dt>
          <dd class="mt-1 font-medium">
            {{ config.label(network.online() ? 'network.online' : 'network.offline') }}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        class="mt-6 rounded-xl bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-90"
        (click)="toast.show('test', 'success')"
      >
        {{ config.label('home.testToast') }}
      </button>
    </section>
  `,
})
export class Home {
  protected readonly config = inject(ConfigService);
  protected readonly network = inject(NetworkService);
  protected readonly toast = inject(ToastService);
}
