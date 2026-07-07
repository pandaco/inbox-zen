import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/i18n';

/** One row of the generic ranked list — mapped by the container per tab. */
export interface StatRow {
  name: string;
  /** Shown as `<email>` after the name (unread tab). */
  email?: string;
  /** Right-aligned formatted value (count, size…). */
  value?: string;
  /** 0-100 → renders the horizontal bar. */
  barPct?: number;
  /** Muted sub-line under the name (sender, "Inbox message"…). */
  fromLine?: string;
  /** Shows the Unsubscribe action. */
  unsubscribeUrl?: string;
  /** Shows the (two-step) permanent-delete action. */
  deletable?: boolean;
  ariaValue?: string;
}

@Component({
  selector: 'app-stat-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="chart" [attr.aria-label]="listAria() || null">
      @for (row of rows(); track $index; let i = $index) {
        <li class="chart__row chart__row--clickable"
            role="button" tabindex="0"
            (click)="rowActivated.emit(row)"
            (keydown.enter)="rowActivated.emit(row)"
            (keydown.space)="$event.preventDefault(); rowActivated.emit(row)">
          <span class="chart__rank">{{ i + 1 }}</span>
          <div class="chart__info">
            <div class="chart__label-row">
              <span class="chart__name">
                {{ row.name }}
                @if (row.email && row.email !== row.name) {
                  <span class="chart__email">&lt;{{ row.email }}&gt;</span>
                }
              </span>
              @if (row.unsubscribeUrl) {
                <button class="chart__unsub"
                        (click)="$event.stopPropagation(); unsubscribeClicked.emit(row)"
                        [title]="'unsubscribeTitle' | t">
                  {{ 'unsubscribe' | t }}
                </button>
              }
              @if (row.deletable) {
                <button class="chart__delete"
                        (click)="$event.stopPropagation(); onDelete(i, row)"
                        (blur)="pendingDelete.set(null)"
                        [title]="'deleteSenderTitle' | t : row.name"
                        [attr.aria-label]="'deleteSenderTitle' | t : row.name">
                  {{ (pendingDelete() === i ? 'confirmAction' : 'delete') | t }}
                </button>
              }
              @if (row.value) {
                <span class="chart__value">{{ row.value }}</span>
              }
            </div>
            @if (row.barPct !== undefined) {
              <div class="chart__bar-bg">
                <div class="chart__bar"
                     [style.width.%]="row.barPct"
                     [attr.aria-label]="row.ariaValue || null">
                </div>
              </div>
            }
            @if (row.fromLine) {
              <div class="chart__from">{{ row.fromLine }}</div>
            }
          </div>
        </li>
      }
    </ol>
  `,
})
export class StatListComponent {
  readonly rows = input.required<StatRow[]>();
  readonly listAria = input<string>('');

  readonly rowActivated = output<StatRow>();
  readonly unsubscribeClicked = output<StatRow>();
  readonly deleteConfirmed = output<StatRow>();

  // Two-step inline confirm: first click arms the row, second click fires.
  protected readonly pendingDelete = signal<number | null>(null);

  protected onDelete(index: number, row: StatRow): void {
    if (this.pendingDelete() === index) {
      this.pendingDelete.set(null);
      this.deleteConfirmed.emit(row);
    } else {
      this.pendingDelete.set(index);
    }
  }
}
