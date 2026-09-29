import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { BOTTOM_BAR_SIZE, NAV } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ConfigService } from './core/services/config.service';
import { NetworkService } from './core/services/network.service';
import { LoginCodeWatchService } from './core/services/login-code-watch.service';
import { ThemeService } from './core/services/theme.service';
import { UpdateService } from './core/services/update.service';
import { Avatar } from './shared/avatar/avatar';
import { BrandCredit } from './shared/brand-credit/brand-credit';
import { Icon } from './shared/icon/icon';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({
  selector: 'app-root',
  imports: [Avatar, BrandCredit, Icon, RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly config = inject(ConfigService);
  protected readonly theme = inject(ThemeService);
  protected readonly network = inject(NetworkService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly updates = inject(UpdateService);
  private readonly codeWatch = inject(LoginCodeWatchService);

  /** Red count on nav items, e.g. pending login codes on Admin. */
  protected readonly badges = computed<Record<string, number>>(() => ({ '/admin': this.codeWatch.pending() }));
  protected readonly moreBadge = computed(() =>
    this.moreItems().reduce((sum, item) => sum + (this.badges()[item.path] ?? 0), 0),
  );

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

  // Phone bottom bar: first items in the bar, the rest in the "More" sheet.
  protected readonly hasBottomBar = computed(() => this.nav().length > 1);
  protected readonly barItems = computed(() => {
    const items = this.nav();
    return items.length <= BOTTOM_BAR_SIZE + 1 ? items : items.slice(0, BOTTOM_BAR_SIZE);
  });
  protected readonly moreItems = computed(() => this.nav().slice(this.barItems().length));
  protected readonly moreActive = computed(() =>
    this.moreItems().some((item) => item.path !== '/' && this.url().startsWith(item.path)),
  );
  protected readonly moreOpen = signal(false);

  protected toggleTheme(): void {
    const mode = this.theme.toggle();
    this.auth.savePreference('theme', mode).catch((err) => console.error(err));
  }
}
