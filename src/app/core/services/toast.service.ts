import { Injectable, inject, signal } from '@angular/core';
import { ConfigService, format } from './config.service';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  text: string;
  /** Optional round thumbnail, e.g. the new profile photo. */
  image?: string;
}

/** Toast texts come from app_settings TOAST_MESSAGES, looked up by key. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly config = inject(ConfigService);
  private readonly _toasts = signal<Toast[]>([]);
  private nextId = 0;
  readonly toasts = this._toasts.asReadonly();

  /** sticky: stays until dismissed (for alerts someone must act on). */
  show(
    messageKey: string,
    type: ToastType = 'info',
    vars?: Record<string, unknown>,
    image?: string,
    sticky = false,
  ): void {
    const text = format(this.config.message('TOAST_MESSAGES', messageKey), vars);
    const toast: Toast = { id: ++this.nextId, type, text, image };
    this._toasts.update((list) => [...list, toast]);

    const duration = this.config.get<number>('TOAST_DURATION_MS');
    if (duration && !sticky) setTimeout(() => this.dismiss(toast.id), duration);
  }

  /** Uses the error's message as a TOAST_MESSAGES key when one exists, else the generic 'error'. */
  error(err: unknown): void {
    const message = (err as { message?: string } | null)?.message;
    const known = message && this.config.get<Record<string, string>>('TOAST_MESSAGES')?.[message];
    console.error(err);
    this.show(known ? message : 'error', 'error');
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
