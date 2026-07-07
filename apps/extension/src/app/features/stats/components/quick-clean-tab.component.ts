import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/i18n';

/** One cleanup category shown as a card on the Quick Clean tab. */
export interface QuickCleanCategory {
  id: string;
  icon: string;
  labelKey: string;
  hintKey: string;
  count: number;
  ids: string[];
}

@Component({
  selector: 'app-quick-clean-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="qc">
      @if (totalCount() === 0) {
        <div class="qc__done">
          <span class="qc__done-icon" aria-hidden="true">🎉</span>
          <h2>{{ 'qcNothingToClean' | t }}</h2>
        </div>
      } @else {
        <p class="qc__total">{{ 'qcTotal' | t : totalCount() }}</p>
        @for (cat of nonEmpty(); track cat.id) {
          <div class="qc__card">
            <span class="qc__icon" aria-hidden="true">{{ cat.icon }}</span>
            <div class="qc__info">
              <span class="qc__label">{{ cat.labelKey | t }}</span>
              <span class="qc__hint">{{ cat.hintKey | t }}</span>
            </div>
            <span class="qc__count">{{ cat.count }}</span>
            <button class="qc__trash"
                    [disabled]="cat.ids.length === 0"
                    (click)="onTrash(cat)"
                    (blur)="pendingId.set(null)"
                    [attr.aria-label]="('qcTrashAll' | t) + ' — ' + (cat.labelKey | t)">
              {{ (pendingId() === cat.id ? 'confirmAction' : 'qcTrashAll') | t }}
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .qc { padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
    .qc__total { margin: 0 0 0.3rem; font-size: 0.78rem; color: var(--text-dim); font-weight: 500; }
    .qc__card {
      display: flex; align-items: center; gap: 0.8rem;
      padding: 0.9rem 1rem;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px;
    }
    .qc__icon { font-size: 1.4rem; }
    .qc__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
    .qc__label { font-size: 0.87rem; font-weight: 600; color: var(--text); }
    .qc__hint {
      font-size: 0.72rem; color: var(--text-dim);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .qc__count { font-size: 1rem; font-weight: 700; color: var(--accent); }
    .qc__trash {
      padding: 0.45rem 0.8rem; border: 1px solid var(--danger-border); border-radius: 6px;
      background: var(--danger-bg); color: var(--danger);
      font-size: 0.78rem; font-weight: 600; cursor: pointer; font-family: inherit;
      transition: background 0.15s; white-space: nowrap;
    }
    .qc__trash:hover:not(:disabled) { background: var(--danger-bg-hover); }
    .qc__trash:disabled { opacity: 0.5; cursor: not-allowed; }
    .qc__done { text-align: center; padding: 3rem 1rem; }
    .qc__done-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
    .qc__done h2 { margin: 0; font-size: 1.1rem; color: var(--text); }
  `,
})
export class QuickCleanTabComponent {
  readonly categories = input.required<QuickCleanCategory[]>();
  readonly trashCategory = output<QuickCleanCategory>();

  // Two-step inline confirm, one armed card at a time.
  protected readonly pendingId = signal<string | null>(null);

  protected readonly nonEmpty = computed(() => this.categories().filter(c => c.count > 0));

  /** Deduped union — a message can belong to several categories. */
  protected readonly totalCount = computed(() => {
    const union = new Set<string>();
    for (const cat of this.categories()) {
      for (const id of cat.ids) union.add(id);
    }
    // Fall back to summed counts when ids are unavailable (stale cached blob).
    return union.size > 0 ? union.size : this.categories().reduce((n, c) => n + c.count, 0);
  });

  protected onTrash(cat: QuickCleanCategory): void {
    if (this.pendingId() === cat.id) {
      this.pendingId.set(null);
      this.trashCategory.emit(cat);
    } else {
      this.pendingId.set(cat.id);
    }
  }
}
