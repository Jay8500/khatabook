import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NAV } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ConfigService } from './core/services/config.service';
import { NetworkService } from './core/services/network.service';
import { ThemeService } from './core/services/theme.service';
import { ToastService } from './core/services/toast.service';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly config = inject(ConfigService);
  protected readonly theme = inject(ThemeService);
  protected readonly network = inject(NetworkService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly nav = computed(() =>
    !this.auth.isLoggedIn() || this.auth.needsOnboarding()
      ? []
      : NAV.filter((item) => !item.permission || this.auth.can(item.permission)),
  );

  protected toggleTheme(): void {
    const mode = this.theme.toggle();
    this.auth.savePreference('theme', mode).catch((err) => console.error(err));
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    this.toast.show('logout', 'info');
    await this.router.navigateByUrl('/login');
  }
}
