import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NAV } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ConfigService } from './core/services/config.service';
import { NetworkService } from './core/services/network.service';
import { ThemeService } from './core/services/theme.service';
import { Avatar } from './shared/avatar/avatar';
import { BrandCredit } from './shared/brand-credit/brand-credit';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({
  selector: 'app-root',
  imports: [Avatar, BrandCredit, RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly config = inject(ConfigService);
  protected readonly theme = inject(ThemeService);
  protected readonly network = inject(NetworkService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onProfile = computed(() => this.url().startsWith('/profile'));

  protected readonly nav = computed(() =>
    !this.auth.isLoggedIn() || this.auth.needsOnboarding()
      ? []
      : NAV.filter((item) => !item.permission || this.auth.can(item.permission)),
  );

  protected toggleTheme(): void {
    const mode = this.theme.toggle();
    this.auth.savePreference('theme', mode).catch((err) => console.error(err));
  }
}
