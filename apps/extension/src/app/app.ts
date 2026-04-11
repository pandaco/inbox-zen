import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import pkg from '../../package.json';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <div class="version">v{{ version }}</div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      position: relative;
    }
    .version {
      position: fixed;
      bottom: 8px;
      right: 8px;
      font-size: 0.75rem;
      color: #666;
      pointer-events: none;
      opacity: 0.7;
      z-index: 1000;
    }
  `,
})
export class App {
  readonly version = pkg.version;
}
