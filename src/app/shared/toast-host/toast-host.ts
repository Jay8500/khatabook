import { Component, inject } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { ToastService, ToastType } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 max-md:in-[.has-bottom-bar]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-2 px-4">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          role="status"
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border border-l-4 bg-surface px-4 py-3 text-sm shadow-lg"
          [class]="accent[toast.type]"
        >
          <p class="flex-1">{{ toast.text }}</p>
          <button
            type="button"
            class="text-muted hover:text-text"
            [attr.aria-label]="config.label('toast.dismiss')"
            (click)="toasts.dismiss(toast.id)"
          >
            &times;
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
  protected readonly config = inject(ConfigService);
  protected readonly accent: Record<ToastType, string> = {
    success: 'border-l-success',
    error: 'border-l-error',
    info: 'border-l-info',
    warning: 'border-l-warning',
  };
}
