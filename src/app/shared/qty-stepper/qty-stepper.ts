import { Component, inject, input, output } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

/** "+" to add; once added, "− qty +" (capped at max). */
@Component({
  selector: 'app-qty-stepper',
  template: `
    @if (qty() === 0) {
      <button
        type="button"
        class="grid h-9 min-w-9 place-items-center rounded-full bg-primary px-3 text-lg font-bold text-on-primary shadow-sm active:scale-95 disabled:bg-border disabled:text-muted"
        [disabled]="max() <= 0"
        [attr.aria-label]="config.label('store.add')"
        (click)="changed.emit(1)"
      >
        +
      </button>
    } @else {
      <div class="flex h-9 items-center overflow-hidden rounded-full border-2 border-primary bg-surface">
        <button type="button" class="grid size-8 place-items-center text-lg font-bold text-primary active:scale-90" [attr.aria-label]="config.label('store.less')" (click)="changed.emit(qty() - 1)">−</button>
        <span class="min-w-7 text-center text-sm font-bold tabular-nums">{{ qty() }}</span>
        <button
          type="button"
          class="grid size-8 place-items-center text-lg font-bold text-primary active:scale-90 disabled:text-muted"
          [disabled]="qty() >= max()"
          [attr.aria-label]="config.label('store.more')"
          (click)="changed.emit(qty() + 1)"
        >
          +
        </button>
      </div>
    }
  `,
})
export class QtyStepper {
  protected readonly config = inject(ConfigService);
  readonly qty = input(0);
  readonly max = input(0);
  readonly changed = output<number>();
}
