import { Component, computed, input, signal } from '@angular/core';

/**
 * Up to two capital initials from a name: "Jay" -> "J", "Jaya Krishna" -> "JK",
 * "jaya_krishna" -> "JK". Spaces, "_", "." and "-" separate words.
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/[\s._-]+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join('');
}

/** Profile photo, or the name's initials when there is none (or it fails to load). */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url() && !failed()) {
      <img [src]="url()" alt="" class="size-full rounded-full object-cover" (error)="failed.set(true)" />
    } @else {
      <span
        class="grid size-full place-items-center rounded-full bg-primary font-bold tracking-tight text-on-primary"
        [style.font-size.px]="size() * (letters().length > 1 ? 0.36 : 0.42)"
      >
        {{ letters() || '•' }}
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
  protected readonly letters = computed(() => initials(this.name()));
}
