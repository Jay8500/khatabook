import { Component, inject } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

/** "Powered by <brand>" from app_settings BRAND; renders nothing when BRAND is unset. */
@Component({
  selector: 'app-brand-credit',
  template: `
    @if (config.brand(); as brand) {
      <a
        [attr.href]="brand.url"
        target="_blank"
        rel="noopener"
        class="mx-auto flex w-fit items-center gap-1.5 text-xs text-muted hover:text-text"
      >
        @if (brand.logoUrl) {
          <img [src]="brand.logoUrl" alt="" class="size-3.5" />
        }
        {{ config.label('footer.poweredBy') }}
        <span class="font-semibold">{{ brand.name }}</span>
      </a>
    }
  `,
})
export class BrandCredit {
  protected readonly config = inject(ConfigService);
}
