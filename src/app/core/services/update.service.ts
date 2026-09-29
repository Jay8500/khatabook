import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ConfigService } from './config.service';

/**
 * Detects a newly deployed version (the service worker otherwise keeps serving the
 * cached one) and lets the user switch with one tap.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly config = inject(ConfigService);
  private readonly _ready = signal(false);
  readonly ready = this._ready.asReadonly();

  start(): void {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this._ready.set(true);
    });
    this.sw.unrecoverable.subscribe(() => document.location.reload());

    const check = () => this.sw.checkForUpdate().catch(() => undefined);
    const seconds = this.config.get<number>('UPDATE_CHECK_SECONDS');
    if (seconds) setInterval(check, seconds * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void check();
    });
    void check();
  }

  async apply(): Promise<void> {
    try {
      await this.sw.activateUpdate();
    } finally {
      document.location.reload();
    }
  }
}
