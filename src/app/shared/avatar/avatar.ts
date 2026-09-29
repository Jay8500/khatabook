import { Component, computed, input, signal } from '@angular/core';

/** Profile photo, or the first letter of the name when there is none (or it fails to load). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url() && !failed()) {
      <img [src]="url()" alt="" class="size-full rounded-full object-cover" (error)="failed.set(true)" />
    } @else {
      <span class="grid size-full place-items-center rounded-full bg-primary font-bold text-on-primary" [style.font-size.px]="size() * 0.42">
        {{ initial() }}
      </span>
    }
  `,
  host: {
    class: 'inline-block shrink-0 overflow-hidden rounded-full',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
})
export class Avatar {
  readonly url = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input(36);

  protected readonly failed = signal(false);
  protected readonly initial = computed(() => (this.name() ?? '').trim().charAt(0).toUpperCase() || '•');
}
