import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';

/**
 * Row that can be swiped left to remove (red "Remove" shows underneath) or right for +1.
 * `hint` plays a one-time nudge so people discover the gesture.
 */
@Component({
  selector: 'app-swipe-row',
  template: `
    <div class="relative overflow-hidden rounded-2xl">
      <!-- Revealed actions -->
      <div class="absolute inset-0 flex items-center justify-between rounded-2xl px-5 text-sm font-semibold text-white"
           [class]="offset() < 0 ? 'bg-error' : 'bg-success'">
        <span [class.opacity-0]="offset() <= 0">+1</span>
        <span [class.opacity-0]="offset() >= 0">{{ config.label('cart.remove') }}</span>
      </div>

      <div
        class="relative touch-pan-y select-none"
        [class.transition-transform]="!dragging()"
        [class.duration-300]="!dragging()"
        [style.transform]="'translateX(' + offset() + 'px)'"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end()"
        (pointercancel)="end()"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class SwipeRow {
  protected readonly config = inject(ConfigService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly hint = input(false);
  readonly removed = output<void>();
  readonly incremented = output<void>();

  protected readonly offset = signal(0);
  protected readonly dragging = signal(false);
  private startX = 0;
  private startY = 0;
  private horizontal: boolean | null = null;

  ngAfterViewInit(): void {
    if (!this.hint()) return;
    // Nudge left, pause, come back: shows that the row can slide.
    setTimeout(() => this.offset.set(-72), 600);
    setTimeout(() => this.offset.set(0), 1500);
  }

  protected start(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.horizontal = null;
    this.dragging.set(true);
  }

  protected move(event: PointerEvent): void {
    if (!this.dragging()) return;
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (this.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (this.horizontal) (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    if (this.horizontal) this.offset.set(Math.max(-160, Math.min(110, dx)));
  }

  protected end(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const width = this.host.nativeElement.offsetWidth || 320;
    const dx = this.offset();
    if (dx < -width * 0.3) {
      this.offset.set(-width);
      setTimeout(() => this.removed.emit(), 200);
      return;
    }
    if (dx > 80) this.incremented.emit();
    this.offset.set(0);
  }
}
