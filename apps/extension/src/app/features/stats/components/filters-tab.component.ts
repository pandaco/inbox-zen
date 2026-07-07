import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { QuickFilter } from '../stats.service';
import { TranslatePipe, t } from '../../../core/i18n/i18n';
import { allUnsubscribeQueryTerms, allOtpPatterns } from '../../../../shared/locale-patterns';

@Component({
  selector: 'app-filters-tab',
  imports: [ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filters">
      <ul class="filters__list">
        @for (f of customFilters(); track f.id) {
          <li class="filters__item">
            <button class="filters__btn" (click)="searchRequested.emit(f.query)">{{ f.label }}</button>
            <button class="filters__icon-btn" (click)="startEditFilter(f)"
                    [title]="'edit' | t" [attr.aria-label]="'edit' | t">✏️</button>
            <button class="filters__icon-btn filters__icon-btn--delete"
                    (click)="deleteFilter(f.id)"
                    (blur)="pendingDeleteId.set(null)"
                    [title]="'delete' | t"
                    [attr.aria-label]="(pendingDeleteId() === f.id ? 'confirmAction' : 'delete') | t">
              {{ pendingDeleteId() === f.id ? ('confirmAction' | t) : '🗑️' }}
            </button>
          </li>
        }
      </ul>

      @if (!isAddingFilter() && !editingFilter()) {
        <button class="filters__add-btn" (click)="startAddFilter()">{{ 'filtersAdd' | t }}</button>
      }

      @if (isAddingFilter() || editingFilter()) {
        <form class="filters__form" [formGroup]="filterForm" (ngSubmit)="saveFilterForm()">
          <h3 class="filters__form-title">{{ (editingFilter() ? 'filterEdit' : 'filterNew') | t }}</h3>

          <div class="filters__form-field">
            <label class="filters__form-label" for="filter-label">{{ 'filterName' | t }}</label>
            <input type="text" id="filter-label" class="filters__form-input"
                   [placeholder]="'filterNamePlaceholder' | t" formControlName="label">
          </div>

          <div class="filters__form-field">
            <label class="filters__form-label" for="filter-query">{{ 'filterQuery' | t }}</label>
            <input type="text" id="filter-query" class="filters__form-input"
                   [placeholder]="'filterQueryPlaceholder' | t" formControlName="query">
          </div>

          <div class="filters__form-actions">
            <button type="button" class="filters__form-btn filters__form-btn--cancel"
                    (click)="cancelFilterForm()">{{ 'cancel' | t }}</button>
            <button type="submit" class="filters__form-btn filters__form-btn--save"
                    [disabled]="filterForm.invalid">{{ 'save' | t }}</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    .filters { padding: 1rem 1.2rem; }
    .filters__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .filters__item { display: flex; gap: 0.5rem; align-items: stretch; }
    .filters__btn {
      flex: 1; padding: 0.6rem 1rem; text-align: left;
      background: var(--surface); border: 1px solid var(--border-input); border-radius: 6px;
      font-size: 0.85rem; color: var(--accent); font-weight: 500; cursor: pointer;
      font-family: inherit; transition: background 0.2s;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .filters__btn:hover { background: var(--surface-hover); }

    .filters__icon-btn {
      min-width: 36px; display: flex; align-items: center; justify-content: center;
      background: var(--bg); border: 1px solid var(--border-input); border-radius: 6px;
      cursor: pointer; font-size: 0.9rem; transition: background 0.2s;
      font-family: inherit; color: var(--text-dim); padding: 0 0.4rem;
    }
    .filters__icon-btn:hover { background: var(--surface-hover); }
    .filters__icon-btn--delete:hover { background: var(--danger-bg); color: var(--danger); border-color: var(--danger-border); }

    .filters__add-btn {
      width: 100%; margin-top: 1rem; padding: 0.6rem;
      background: var(--bg); border: 1px dashed var(--border-input); border-radius: 6px;
      color: var(--text-dim); font-size: 0.85rem; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: all 0.2s;
    }
    .filters__add-btn:hover { background: var(--surface); border-color: var(--accent); color: var(--accent); }

    .filters__form {
      margin-top: 1rem; padding: 1rem; background: var(--surface); border: 1px solid var(--border-input); border-radius: 8px;
      display: flex; flex-direction: column; gap: 0.8rem;
    }
    .filters__form-title { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text); }
    .filters__form-field { display: flex; flex-direction: column; gap: 0.3rem; }
    .filters__form-label { font-size: 0.75rem; font-weight: 600; color: var(--text-dim); }
    .filters__form-input {
      padding: 0.5rem; border: 1px solid var(--border-input); border-radius: 4px;
      font-size: 0.85rem; font-family: inherit;
      background: var(--bg); color: var(--text);
    }
    .filters__form-input:focus { outline: none; border-color: var(--accent); }
    .filters__form-actions { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
    .filters__form-btn {
      flex: 1; padding: 0.5rem; border: 1px solid var(--border-input); border-radius: 4px;
      font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .filters__form-btn--save { background: var(--accent); color: var(--accent-contrast); border-color: var(--accent); }
    .filters__form-btn--save:hover:not(:disabled) { background: var(--accent-hover); }
    .filters__form-btn--save:disabled { opacity: 0.5; cursor: not-allowed; }
    .filters__form-btn--cancel { background: var(--bg); color: var(--text-dim); }
    .filters__form-btn--cancel:hover { background: var(--surface-hover); }
  `,
})
export class FiltersTabComponent implements OnInit {
  readonly searchRequested = output<string>();

  private readonly fb = inject(FormBuilder);

  protected readonly customFilters = signal<QuickFilter[]>([]);
  protected readonly isAddingFilter = signal(false);
  protected readonly editingFilter = signal<QuickFilter | null>(null);
  // Two-step inline confirm for filter deletion.
  protected readonly pendingDeleteId = signal<string | null>(null);

  protected readonly filterForm = this.fb.nonNullable.group({
    label: ['', [Validators.required]],
    query: ['', [Validators.required]],
  });

  ngOnInit(): void {
    chrome.storage.local.get('custom_filters', (data) => {
      let filters = data['custom_filters'] as QuickFilter[] | undefined;
      const otpTerms = allOtpPatterns.map(p => {
        const source = p.source;
        return source.includes(' ') ? `"${source}"` : source;
      });
      const otpFilter: QuickFilter = {
        id: '3',
        label: t('defaultFilterOtp'),
        query: `subject:(${otpTerms.join(' OR ')})`,
      };

      if (filters && Array.isArray(filters)) {
        // Migration: add the OTP filter if missing
        if (!filters.find(f => f.id === '3' || f.label.includes('OTP'))) {
          filters = [...filters, otpFilter];
          this.customFilters.set(filters);
          this.saveFiltersToStorage();
        } else {
          this.customFilters.set(filters);
        }
      } else {
        // Default filters for new users
        const defaults: QuickFilter[] = [
          { id: '1', label: t('defaultFilterNewsletters'), query: 'newsletter' },
          {
            id: '2',
            label: t('defaultFilterUnsubscribe'),
            query: ['unsubscribe', ...allUnsubscribeQueryTerms.filter(q => q !== 'unsubscribe')].join(' OR '),
          },
          otpFilter,
        ];
        this.customFilters.set(defaults);
        this.saveFiltersToStorage();
      }
    });
  }

  protected startAddFilter(): void {
    this.isAddingFilter.set(true);
    this.editingFilter.set(null);
    this.filterForm.reset();
  }

  protected startEditFilter(filter: QuickFilter): void {
    this.editingFilter.set(filter);
    this.isAddingFilter.set(false);
    this.filterForm.patchValue({ label: filter.label, query: filter.query });
  }

  protected cancelFilterForm(): void {
    this.isAddingFilter.set(false);
    this.editingFilter.set(null);
    this.filterForm.reset();
  }

  protected saveFilterForm(): void {
    if (this.filterForm.invalid) return;

    const { label, query } = this.filterForm.getRawValue();
    const current = this.customFilters();
    const edit = this.editingFilter();

    if (edit) {
      this.customFilters.set(current.map(f => (f.id === edit.id ? { ...f, label, query } : f)));
    } else {
      this.customFilters.set([
        ...current,
        { id: Math.random().toString(36).slice(2, 9), label, query },
      ]);
    }

    this.saveFiltersToStorage();
    this.cancelFilterForm();
  }

  protected deleteFilter(id: string): void {
    if (this.pendingDeleteId() !== id) {
      this.pendingDeleteId.set(id);
      return;
    }
    this.pendingDeleteId.set(null);
    this.customFilters.update(filters => filters.filter(f => f.id !== id));
    this.saveFiltersToStorage();
  }

  private saveFiltersToStorage(): void {
    chrome.storage.local.set({ 'custom_filters': this.customFilters() });
  }
}
