import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { ADMIN_SECTIONS } from './admin.routes';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <nav class="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
      @for (section of sections(); track section.path) {
        <a
          [routerLink]="section.path"
          routerLinkActive="!bg-primary !text-on-primary !border-primary"
          class="shrink-0 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium"
        >
          {{ config.label(section.label) }}
        </a>
      }
    </nav>
    <router-outlet />
  `,
})
export class AdminLayout {
  protected readonly config = inject(ConfigService);
  private readonly auth = inject(AuthService);
  protected readonly sections = computed(() => ADMIN_SECTIONS.filter((s) => this.auth.can(s.permission)));
}
