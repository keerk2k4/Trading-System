import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './shared/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent {
  title = 'trading-ui';

  // Created here so a remembered theme applies before the first screen renders.
  private readonly theme = inject(ThemeService);
}
