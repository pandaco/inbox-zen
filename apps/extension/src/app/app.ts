import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
  host: {
    '(document:keydown.escape)': 'closePanel()',
  },
  styles: `
    :host {
      display: block;
      height: 100vh;
      width: 100%;
      background: var(--bg);
      overflow-y: auto;
    }
  `,
})
export class App {
  /** Escape closes the Gmail side panel when the app runs inside its iframe. */
  protected closePanel(): void {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'CLOSE_PANEL' }, 'https://mail.google.com');
    }
  }
}
