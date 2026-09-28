import { Injectable, inject, signal } from '@angular/core';
import { ConfigService } from './config.service';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  text: string;
}

/** Toast texts come from app_settings TOAST_MESSAGES, looked up by key. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly config = inject(ConfigService);
  private readonly _toasts = signal<Toast[]>([]);
  private nextId = 0;
  readonly toasts = this._toasts.asReadonly();

  show(messageKey: string, type: ToastType = 'info'): void {
    const text = this.config.message('TOAST_MESSAGES', messageKey);
    const toast: Toast = { id: ++this.nextId, type, text };
    this._toasts.update((list) => [...list, toast]);

    const duration = this.config.get<number>('TOAST_DURATION_MS');
    if (duration) setTimeout(() => this.dismiss(toast.id), duration);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
