import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfigService } from './core/services/config.service';
import { NetworkService } from './core/services/network.service';
import { ThemeService } from './core/services/theme.service';
import { ToastHost } from './shared/toast-host/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly config = inject(ConfigService);
  protected readonly theme = inject(ThemeService);
  protected readonly network = inject(NetworkService);
}
