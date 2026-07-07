import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/i18n';

/** Bottom toast shown after a trash action. The container owns the timer. */
@Component({
  selector: 'app-undo-toast',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast" role="status">
      <span class="toast__message">{{ message() }}</span>
      <button class="toast__undo" (click)="undo.emit()">{{ 'undo' | t }}</button>
    </div>
  `,
  styles: `
    .toast {
      position: fixed;
      bottom: 3.2rem;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      background: var(--text);
      color: var(--bg);
      font-size: 0.82rem;
      box-shadow: var(--shadow);
      z-index: 10;
      max-width: 90%;
    }
    .toast__message {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* The toast inverts the theme colors, so the accent must invert too:
       light-blue on the dark toast (light mode), dark-blue on the light
       toast (dark mode). */
    .toast__undo {
      background: none;
      border: none;
      color: #8ab4f8;
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      font-family: inherit;
      padding: 0.2rem 0.4rem;
      flex-shrink: 0;
    }
    @media (prefers-color-scheme: dark) {
      .toast__undo { color: #1a73e8; }
    }
  `,
})
export class UndoToastComponent {
  readonly message = input.required<string>();
  readonly undo = output<void>();
}
