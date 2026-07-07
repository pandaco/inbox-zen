import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SizeStat } from '../stats.service';
import { TranslatePipe } from '../../../core/i18n/i18n';

@Component({
  selector: 'app-challenge-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="challenge">
      @if (items().length === 0) {
        <div class="challenge__complete">
          <span class="challenge__icon" aria-hidden="true">🎉</span>
          <h2>{{ 'inboxZero' | t }}</h2>
          <p>{{ 'challengeDone' | t }}</p>
        </div>
      } @else {
        <div class="challenge__card">
          <div class="challenge__meta">{{ 'challengeOldest' | t : items().length }}</div>
          <h2 class="challenge__subject">{{ current()?.subject }}</h2>
          <div class="challenge__from">{{ current()?.from }}</div>
          @if (current()?.snippet) {
            <div class="challenge__snippet">{{ current()?.snippet }}</div>
          }
          <div class="challenge__actions">
            <button class="challenge__btn challenge__btn--keep" (click)="keep.emit(current()!)">
              {{ 'keep' | t }}
            </button>
            <button class="challenge__btn challenge__btn--trash" (click)="trash.emit(current()!)">
              {{ 'trash' | t }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .challenge { padding: 2rem 1.2rem; display: flex; justify-content: center; }
    .challenge__card {
      width: 100%; max-width: 350px; background: var(--bg); border: 1px solid var(--border);
      border-radius: 12px; padding: 1.5rem; box-shadow: var(--shadow);
      display: flex; flex-direction: column; gap: 1rem;
    }
    .challenge__meta { font-size: 0.7rem; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; }
    .challenge__subject { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text); line-height: 1.4; }
    .challenge__from { font-size: 0.82rem; color: var(--text-dim); word-break: break-all; margin-bottom: 0.4rem; }
    .challenge__snippet {
      font-size: 0.85rem; color: var(--text-dim); line-height: 1.5;
      background: var(--surface); padding: 0.8rem; border-radius: 8px;
      max-height: 120px; overflow-y: auto; font-style: italic;
      border-left: 3px solid var(--accent);
    }
    .challenge__actions { display: flex; gap: 1rem; margin-top: 0.5rem; }
    .challenge__btn {
      flex: 1; padding: 0.7rem; border: 1px solid var(--border-input); border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit;
      transition: all 0.2s;
    }
    .challenge__btn--keep { background: var(--bg); color: var(--text); }
    .challenge__btn--keep:hover { background: var(--surface-hover); }
    .challenge__btn--trash { background: var(--danger-bg); color: var(--danger); border-color: var(--danger-border); }
    .challenge__btn--trash:hover { background: var(--danger-bg-hover); }
    .challenge__complete { text-align: center; }
    .challenge__icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
  `,
})
export class ChallengeTabComponent {
  readonly items = input.required<SizeStat[]>();
  readonly keep = output<SizeStat>();
  readonly trash = output<SizeStat>();

  protected readonly current = computed(() => (this.items().length > 0 ? this.items()[0] : null));
}
