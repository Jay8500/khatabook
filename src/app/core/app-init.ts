import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';
import { ConfigService } from './services/config.service';
import { PwaService } from './services/pwa.service';
import { ThemeService } from './services/theme.service';

/** Runs before the first render: settings first, then everything that depends on them. */
export async function initApp(): Promise<void> {
  const config = inject(ConfigService);
  const theme = inject(ThemeService);
  const pwa = inject(PwaService);
  const auth = inject(AuthService);

  await config.load();
  theme.apply();
  pwa.apply();
  await auth.init();
}
