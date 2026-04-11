import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
  styles: `
    :host {
      display: block;
      height: 100vh;
      width: 100%;
      background: white;
      overflow-y: auto;
    }
  `,
})
export class App {}
