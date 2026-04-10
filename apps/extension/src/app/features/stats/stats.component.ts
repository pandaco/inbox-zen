import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, effect, inject, signal, computed, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StatsService, SenderStat, SizeStat, SubjectStat, GlobalStats, QuickFilter } from './stats.service';
import { GmailSearchService } from '../../core/gmail-search/gmail-search.service';

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Tab = 'unread' | 'heaviest' | 'repeated' | 'filters' | 'otp' | 'parcels' | 'old' | 'invites' | 'redundant' | 'challenge';

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stats">
      <header class="stats__header">
        <h1 class="stats__title">Inbox Zen</h1>
        <div class="stats__actions">
          <button class="stats__action-btn" (click)="openInNewTab()" aria-label="Open in new tab" title="Open in new tab">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
          <button class="stats__action-btn" (click)="auth.logout()" aria-label="Sign out" title="Sign out">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      @if (!isLoading()) {
        <nav class="stats__tabs" role="tablist">
          <button role="tab" [attr.aria-selected]="activeTab() === 'unread'"
            [class.active]="activeTab() === 'unread'" (click)="setTab('unread')">
            Unread
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'repeated'"
            [class.active]="activeTab() === 'repeated'" (click)="setTab('repeated')">
            Repeated
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'heaviest'"
            [class.active]="activeTab() === 'heaviest'" (click)="setTab('heaviest')">
            Heaviest
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'otp'"
            [class.active]="activeTab() === 'otp'" (click)="setTab('otp')" title="Expired verification codes">
            OTP
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'parcels'"
            [class.active]="activeTab() === 'parcels'" (click)="setTab('parcels')" title="Parcel tracking">
            Parcels
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'old'"
            [class.active]="activeTab() === 'old'" (click)="setTab('old')" title="Emails > 2 years without label">
            Old
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'invites'"
            [class.active]="activeTab() === 'invites'" (click)="setTab('invites')" title="Past calendar invites">
            Invites
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'redundant'"
            [class.active]="activeTab() === 'redundant'" (click)="setTab('redundant')" title="Redundant message threads">
            Redundant
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'filters'"
            [class.active]="activeTab() === 'filters'" (click)="setTab('filters')">
            Filters
          </button>
          <button role="tab" [attr.aria-selected]="activeTab() === 'challenge'"
            [class.active]="activeTab() === 'challenge'" (click)="setTab('challenge')" title="Zero-Inbox Challenge">
            Challenge ⚡
          </button>
        </nav>
      }

      @if (totalFetched() > 0) {
        <div class="stats__meta" [class.stats__meta--error]="errorCount() > 0">
          {{ totalFetched() }} emails analysed
          @if (errorCount() > 0) {
            · <strong>{{ errorCount() }} errors</strong> (partial data)
          }
        </div>
      }

      <div class="stats__body" #body>
        @if (isLoading() && totalFetched() === 0) {
          <div class="stats__loading" role="status" aria-label="Loading">
            <span class="stats__spinner"></span>
            @if (loadTotal() > 0) {
              <p class="stats__loading-text">
                Analyzing {{ loadTotal() }} emails in your Inbox…
              </p>
              <div class="stats__load-bar-bg">
                <div class="stats__load-bar"
                  [style.width.%]="(loadFetched() / loadTotal()) * 100">
                </div>
              </div>
            } @else {
              <p class="stats__loading-text">Scanning Inbox (read & unread)…</p>
            }
          </div>
        } @else {
          @if (isLoading()) {
            <div class="stats__progress-overlay">
              <div class="stats__load-bar-bg stats__load-bar-bg--mini">
                <div class="stats__load-bar"
                  [style.width.%]="(loadFetched() / loadTotal()) * 100">
                </div>
              </div>
              <p class="stats__loading-text stats__loading-text--mini">
                Updating results... {{ loadFetched() }} / {{ loadTotal() }}
              </p>
            </div>
          }

          @if (error()) {
            <div class="stats__error" role="alert">
              <p>{{ error() }}</p>
              <button class="stats__retry" (click)="load(true)">Retry</button>
            </div>
          } @else if (activeTab() === 'unread') {
          @if (visibleSenders().length === 0) {
            <p class="stats__empty">No unread emails found.</p>
          } @else {
            <ol class="chart" aria-label="Top senders by unread email count">
              @for (item of visibleSenders(); track item.email; let i = $index) {
                <li class="chart__row chart__row--clickable"
                    role="button" tabindex="0"
                    (click)="searchSender(item)"
                    (keydown.enter)="searchSender(item)"
                    (keydown.space)="searchSender(item)"
                    [title]="'Search: from:' + item.email + ' is:unread'">
                  <span class="chart__rank">{{ i + 1 }}</span>
                  <div class="chart__info">
                    <div class="chart__label-row">
                      <span class="chart__name">
                        {{ item.sender }}
                        @if (item.email && item.email !== item.sender) {
                          <span class="chart__email">&lt;{{ item.email }}&gt;</span>
                        }
                      </span>
                      @if (item.unsubscribeUrl) {
                        <button class="chart__unsub" (click)="$event.stopPropagation(); unsubscribe(item)"
                                title="Unsubscribe from this list">
                          Unsubscribe
                        </button>
                      }
                      <span class="chart__value">{{ item.count }}</span>
                    </div>
                    <div class="chart__bar-bg" role="presentation">
                      <div class="chart__bar"
                        [style.width.%]="(item.count / sendersMax()) * 100"
                        [attr.aria-label]="item.count + ' unread emails'">
                      </div>
                    </div>
                  </div>
                </li>
              }
            </ol>
          }
        } @else if (activeTab() === 'heaviest') {
          @if (visibleHeaviest().length === 0) {
            <p class="stats__empty">No heavy emails found.</p>
          } @else {
            <ol class="chart" aria-label="Top emails by size">
              @for (item of visibleHeaviest(); track item.subject + item.from + $index; let i = $index) {
                <li class="chart__row chart__row--clickable"
                    role="button" tabindex="0"
                    (click)="searchHeaviest(item)"
                    (keydown.enter)="searchHeaviest(item)"
                    (keydown.space)="searchHeaviest(item)"
                    [title]="'Search: ' + item.subject">
                  <span class="chart__rank">{{ i + 1 }}</span>
                  <div class="chart__info">
                    <div class="chart__label-row">
                      <span class="chart__name">{{ item.subject }}</span>
                      <span class="chart__value">{{ formatSize(item.sizeEstimate) }}</span>
                    </div>
                    <div class="chart__bar-bg" role="presentation">
                      <div class="chart__bar chart__bar--orange"
                        [style.width.%]="(item.sizeEstimate / heaviestMax()) * 100"
                        [attr.aria-label]="formatSize(item.sizeEstimate)">
                      </div>
                    </div>
                  </div>
                </li>
              }
            </ol>
          }
        } @else if (activeTab() === 'repeated' || activeTab() === 'otp' || activeTab() === 'parcels' || activeTab() === 'old' || activeTab() === 'invites' || activeTab() === 'redundant') {
          @if (currentItems().length === 0) {
            <p class="stats__empty">No items found.</p>
          } @else {
            <ol class="chart" [attr.aria-label]="activeTab()">
              @for (item of currentItems(); track item.subject + $index; let i = $index) {
                <li class="chart__row chart__row--clickable"
                    role="button" tabindex="0"
                    (click)="searchRepeated(item)"
                    (keydown.enter)="searchRepeated(item)"
                    (keydown.space)="searchRepeated(item)"
                    [title]="'Search: ' + item.subject">
                  <span class="chart__rank">{{ i + 1 }}</span>
                  <div class="chart__info">
                    <div class="chart__label-row">
                      <span class="chart__name">{{ item.subject }}</span>
                      @if (activeTab() === 'repeated' || activeTab() === 'redundant') {
                        <span class="chart__value">{{ item.count }}</span>
                      }
                    </div>
                    <div class="chart__bar-bg" role="presentation">
                      <div class="chart__bar chart__bar--purple"
                        [style.width.%]="(activeTab() === 'repeated' || activeTab() === 'redundant') ? (item.count / (currentMax() || 1)) * 100 : 100">
                      </div>
                    </div>
                  </div>
                </li>
              }
            </ol>
          }
        } @else if (activeTab() === 'challenge') {
          <div class="challenge">
            @if (!challengeCurrent()) {
              <p class="stats__empty">Challenge completed! No more old emails in inbox. 🎉</p>
            } @else {
              <div class="challenge__card">
                <div class="challenge__meta">Oldest Email ({{ oldestEmails().length }} left)</div>
                <h2 class="challenge__subject">{{ challengeCurrent()?.subject }}</h2>
                <div class="challenge__from">{{ challengeCurrent()?.from }}</div>
                @if (challengeCurrent()?.snippet) {
                  <div class="challenge__snippet">{{ challengeCurrent()?.snippet }}</div>
                }
                <div class="challenge__actions">
                  <button class="challenge__btn challenge__btn--keep" (click)="skipChallenge(challengeCurrent()!)">Keep</button>
                  <button class="challenge__btn challenge__btn--trash" (click)="trashChallenge(challengeCurrent()!)">Trash</button>
                </div>
              </div>
            }
          </div>
        } @else if (activeTab() === 'filters') {
          <div class="filters">
            <p class="filters__desc">Quick searches to clean up your inbox.</p>
            <ul class="filters__list">
              @for (f of customFilters(); track f.id) {
                <li class="filters__item">
                  <button class="filters__btn" (click)="searchFilter(f.query)">{{ f.label }}</button>
                  <button class="filters__icon-btn" (click)="startEditFilter(f)" title="Edit">✏️</button>
                  <button class="filters__icon-btn filters__icon-btn--delete" (click)="deleteFilter(f.id)" title="Delete">🗑️</button>
                </li>
              }
            </ul>

            @if (!isAddingFilter() && !editingFilter()) {
              <button class="filters__add-btn" (click)="startAddFilter()">+ Add a personalized filter</button>
            }

            @if (isAddingFilter() || editingFilter()) {
              <div class="filters__form">
                <h3 class="filters__form-title">{{ editingFilter() ? 'Edit Filter' : 'New Filter' }}</h3>
                
                <div class="filters__form-field">
                  <label class="filters__form-label" for="filter-label">Name</label>
                  <input type="text" id="filter-label" class="filters__form-input" placeholder="e.g. My Newsletters" 
                         [value]="formLabel()" (input)="setFormLabel($any($event.target).value)">
                </div>

                <div class="filters__form-field">
                  <label class="filters__form-label" for="filter-query">Gmail Query</label>
                  <input type="text" id="filter-query" class="filters__form-input" placeholder="e.g. from:me to:me"
                         [value]="formQuery()" (input)="setFormQuery($any($event.target).value)">
                </div>

                <div class="filters__form-actions">
                  <button class="filters__form-btn filters__form-btn--cancel" (click)="cancelFilterForm()">Cancel</button>
                  <button class="filters__form-btn filters__form-btn--save" (click)="saveFilterForm()">Save</button>
                </div>
              </div>
            }
          </div>
        }
        @if (hasMore() && activeTab() !== 'filters' && activeTab() !== 'challenge') {
          <div #sentinel class="stats__sentinel" aria-hidden="true"></div>
        }
      }
      </div>

      <footer class="stats__footer">
        @if (activeCachedAt()) {
          <span class="stats__sync-time"
                [class.stats__sync-time--cached]="isFromCache()">
            {{ isFromCache() ? 'Cached' : 'Synced' }} · {{ formatTimeAgo(activeCachedAt()!) }}
          </span>
        }
        <button class="stats__refresh" (click)="load(true)" [disabled]="isLoading()">
          Sync now
        </button>
      </footer>
    </div>
  `,
  styles: `
    .stats {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: 'Google Sans', Roboto, sans-serif;
      color: #202124;
      background: #fff;
    }

    .stats__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.2rem 0.8rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .stats__title { margin: 0; font-size: 1.1rem; font-weight: 600; }

    .stats__actions {
      display: flex;
      gap: 0.2rem;
    }

    .stats__action-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border: none; border-radius: 50%;
      background: transparent; color: #5f6368; cursor: pointer;
    }
    .stats__action-btn:hover { background: #f1f3f4; }

    .stats__tabs {
      display: flex;
      border-bottom: 1px solid #e0e0e0;
      overflow-x: auto;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE/Edge */
    }
    .stats__tabs::-webkit-scrollbar { display: none; } /* Chrome/Safari */

    .stats__tabs button {
      flex: 0 0 auto; padding: 0.7rem 1rem; border: none; background: transparent;
      font-size: 0.85rem; font-weight: 500; color: #5f6368; cursor: pointer;
      border-bottom: 2px solid transparent; font-family: inherit;
      white-space: nowrap;
    }
    .stats__tabs button.active { color: #1a73e8; border-bottom-color: #1a73e8; }

    .stats__meta {
      padding: 0.4rem 1.2rem;
      font-size: 0.75rem;
      color: #5f6368;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }
    .stats__meta--error { color: #b06000; background: #fef7e0; }

    .stats__body { flex: 1; overflow-y: auto; padding: 0.75rem 0; }

    .stats__loading {
      display: flex; flex-direction: column;
      align-items: center; gap: 0.75rem; padding: 3rem 1.5rem 2rem;
    }
    .stats__loading-text { margin: 0; font-size: 0.82rem; color: #5f6368; }
    .stats__loading-text--mini { font-size: 0.75rem; font-weight: 600; text-align: center; margin-top: 0.3rem; }
    .stats__load-bar-bg {
      width: 100%; height: 4px;
      background: #e0e0e0; border-radius: 2px; overflow: hidden;
    }
    .stats__load-bar-bg--mini { height: 3px; border-radius: 0; }
    .stats__load-bar {
      height: 100%; background: #1a73e8; border-radius: 2px;
      transition: width 0.3s ease;
    }
    .stats__progress-overlay {
      position: sticky; top: 0; z-index: 10;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(4px);
      padding: 0.6rem 1.2rem;
      border-bottom: 1px solid #e0e0e0;
    }
    .stats__spinner {
      width: 28px; height: 28px;
      border: 3px solid #e0e0e0; border-top-color: #1a73e8;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .stats__error {
      padding: 1.2rem; text-align: center; color: #c5221f; font-size: 0.85rem;
    }
    .stats__retry {
      margin-top: 0.5rem; padding: 0.4rem 1rem;
      border: 1px solid #c5221f; border-radius: 4px;
      background: transparent; color: #c5221f;
      font-size: 0.85rem; cursor: pointer; font-family: inherit;
    }

    .stats__empty {
      padding: 2rem 1.2rem; color: #5f6368;
      font-size: 0.9rem; text-align: center;
    }

    /* Chart */
    .chart { list-style: none; margin: 0; padding: 0 0.5rem; }

    .chart__row {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.55rem 0.5rem;
      border-bottom: 1px solid #f1f3f4;
    }
    .chart__row:last-child { border-bottom: none; }

    .chart__row--clickable {
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.12s;
    }
    .chart__row--clickable:hover { background: #f1f3f4; }

    .chart__rank {
      min-width: 18px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #9aa0a6;
      padding-top: 2px;
      text-align: right;
    }

    .chart__info { flex: 1; min-width: 0; }

    .chart__label-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 4px;
    }

    .chart__name {
      font-size: 0.82rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .chart__email {
      font-size: 0.75rem;
      font-weight: 400;
      color: #5f6368;
      margin-left: 0.3rem;
    }

    .chart__value {
      font-size: 0.78rem;
      font-weight: 600;
      color: #1a73e8;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .chart__unsub {
      font-size: 0.7rem; color: #5f6368; background: #f1f3f4;
      border: 1px solid #dadce0; border-radius: 4px;
      padding: 2px 6px; cursor: pointer; font-weight: 500;
      margin-left: 0.5rem;
    }
    .chart__unsub:hover { background: #e8eaed; color: #202124; }

    .chart__clear {
      font-size: 0.7rem; color: #c5221f; background: #fff;
      border: 1px solid #f5c2c7; border-radius: 4px;
      padding: 2px 6px; cursor: pointer; font-weight: 500;
      margin-left: 0.4rem;
    }
    .chart__clear:hover { background: #fce8e6; }

    .chart__bar-bg {
      width: 100%;
      height: 6px;
      background: #f1f3f4;
      border-radius: 3px;
      overflow: hidden;
    }

    .chart__bar {
      height: 100%;
      background: #1a73e8;
      border-radius: 3px;
      transition: width 0.4s ease;
    }

    .chart__bar--orange { background: #fa7b17; }
    .chart__bar--purple { background: #a142f4; }

    .stats__footer {
      padding: 0.8rem 1.2rem;
      border-top: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .stats__sync-time {
      font-size: 0.75rem;
      color: #9aa0a6;
    }
    .stats__sync-time--cached { color: #f29900; }

    .stats__refresh {
      padding: 0.4rem 1rem;
      border: 1px solid #dadce0; border-radius: 4px;
      background: #fff; color: #1a73e8;
      font-size: 0.85rem; font-weight: 500;
      cursor: pointer; font-family: inherit;
    }
    .stats__refresh:hover:not(:disabled) { background: #f8f9fa; }
    .stats__refresh:disabled { opacity: 0.5; cursor: not-allowed; }

    .stats__sentinel { height: 1px; }

    /* Filters Tab */
    .filters { padding: 1rem 1.2rem; }
    .filters__desc { font-size: 0.85rem; color: #5f6368; margin-bottom: 1rem; }
    .filters__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .filters__item {
      display: flex; gap: 0.5rem; align-items: stretch;
    }
    .filters__btn {
      flex: 1; padding: 0.6rem 1rem; text-align: left;
      background: #f8f9fa; border: 1px solid #dadce0; border-radius: 6px;
      font-size: 0.85rem; color: #1a73e8; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: background 0.2s;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .filters__btn:hover { background: #f1f3f4; }
    
    .filters__icon-btn {
      width: 36px; display: flex; align-items: center; justify-content: center;
      background: #fff; border: 1px solid #dadce0; border-radius: 6px;
      cursor: pointer; font-size: 0.9rem; transition: background 0.2s;
    }
    .filters__icon-btn:hover { background: #f1f3f4; }
    .filters__icon-btn--delete:hover { background: #fce8e6; color: #c5221f; border-color: #f5c2c7; }

    .filters__add-btn {
      width: 100%; margin-top: 1rem; padding: 0.6rem;
      background: #fff; border: 1px dashed #dadce0; border-radius: 6px;
      color: #5f6368; font-size: 0.85rem; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: all 0.2s;
    }
    .filters__add-btn:hover { background: #f8f9fa; border-color: #1a73e8; color: #1a73e8; }

    .filters__form {
      margin-top: 1rem; padding: 1rem; background: #f8f9fa; border: 1px solid #dadce0; border-radius: 8px;
      display: flex; flex-direction: column; gap: 0.8rem;
    }
    .filters__form-title { margin: 0; font-size: 0.9rem; font-weight: 600; color: #202124; }
    .filters__form-field { display: flex; flex-direction: column; gap: 0.3rem; }
    .filters__form-label { font-size: 0.75rem; font-weight: 600; color: #5f6368; }
    .filters__form-input {
      padding: 0.5rem; border: 1px solid #dadce0; border-radius: 4px;
      font-size: 0.85rem; font-family: inherit;
    }
    .filters__form-input:focus { outline: none; border-color: #1a73e8; }
    .filters__form-actions { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
    .filters__form-btn {
      flex: 1; padding: 0.5rem; border: 1px solid #dadce0; border-radius: 4px;
      font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit;
    }
    .filters__form-btn--save { background: #1a73e8; color: #fff; border-color: #1a73e8; }
    .filters__form-btn--save:hover { background: #1557b0; }
    .filters__form-btn--cancel { background: #fff; color: #5f6368; }
    .filters__form-btn--cancel:hover { background: #f1f3f4; }

    /* Challenge Mode */
    .challenge { padding: 2rem 1.2rem; display: flex; justify-content: center; }
    .challenge__card {
      width: 100%; max-width: 350px; background: #fff; border: 1px solid #e0e0e0;
      border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; gap: 1rem;
    }
    .challenge__meta { font-size: 0.7rem; font-weight: 600; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.5px; }
    .challenge__subject { margin: 0; font-size: 1rem; font-weight: 600; color: #202124; line-height: 1.4; }
    .challenge__from { font-size: 0.82rem; color: #5f6368; word-break: break-all; margin-bottom: 0.4rem; }
    .challenge__snippet { 
      font-size: 0.85rem; color: #5f6368; line-height: 1.5;
      background: #f8f9fa; padding: 0.8rem; border-radius: 8px;
      max-height: 120px; overflow-y: auto; font-style: italic;
      border-left: 3px solid #1a73e8;
    }
    .challenge__actions { display: flex; gap: 1rem; margin-top: 0.5rem; }
    .challenge__btn {
      flex: 1; padding: 0.7rem; border: 1px solid #dadce0; border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit;
      transition: all 0.2s;
    }
    .challenge__btn--keep { background: #fff; color: #1a73e8; }
    .challenge__btn--keep:hover { background: #f8f9fa; border-color: #1a73e8; }
    .challenge__btn--trash { background: #c5221f; color: #fff; border-color: #c5221f; }
    .challenge__btn--trash:hover { background: #a50e0e; }
  `,
})
export class StatsComponent implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly statsService = inject(StatsService);
  private readonly gmailSearch = inject(GmailSearchService);
  private readonly router = inject(Router);

  private readonly PAGE_SIZE = 10;
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer?: IntersectionObserver;

  protected readonly activeTab = signal<Tab>('unread');
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadFetched = signal(0);
  protected readonly loadTotal = signal(0);

  protected readonly displayCount = signal(this.PAGE_SIZE);
  protected readonly globalCachedAt = signal<number | null>(null);
  protected readonly stats = signal<GlobalStats | null>(null);

  protected readonly senders = computed(() => {
    const items = this.stats()?.unreadSenders.items ?? [];
    return [...items].sort((a, b) => b.count - a.count);
  });
  protected readonly heaviest = computed(() => this.stats()?.heaviestEmails.items ?? []);
  protected readonly repeated = computed(() => this.stats()?.repeatedSubjects.items ?? []);
  protected readonly otps = computed(() => this.stats()?.expiredOTPs.items ?? []);
  protected readonly parcels = computed(() => this.stats()?.parcelNotifications.items ?? []);
  protected readonly oldEmails = computed(() => this.stats()?.oldEmails.items ?? []);
  protected readonly pastInvites = computed(() => this.stats()?.pastInvites.items ?? []);
  protected readonly redundantThreads = computed(() => this.stats()?.redundantThreads.items ?? []);
  protected readonly oldestEmails = signal<SizeStat[]>([]); // Keep as signal for local updates in challenge

  protected readonly totalFetched = computed(() => {
    const tab = this.activeTab();
    const s = this.stats();
    if (!s) return 0;
    if (tab === 'unread') return s.unreadSenders.totalFetched;
    if (tab === 'repeated') return s.repeatedSubjects.totalFetched;
    if (tab === 'otp') return s.expiredOTPs.totalFetched;
    if (tab === 'parcels') return s.parcelNotifications.totalFetched;
    if (tab === 'old') return s.oldEmails.totalFetched;
    if (tab === 'invites') return s.pastInvites.totalFetched;
    if (tab === 'redundant') return s.redundantThreads.totalFetched;
    if (tab === 'challenge') return s.oldestEmails.totalFetched;
    return s.heaviestEmails.totalFetched;
  });

  protected readonly errorCount = computed(() => {
    const tab = this.activeTab();
    const s = this.stats();
    if (!s) return 0;
    if (tab === 'unread') return s.unreadSenders.errorCount;
    if (tab === 'repeated') return s.repeatedSubjects.errorCount;
    if (tab === 'otp') return s.expiredOTPs.errorCount;
    if (tab === 'parcels') return s.parcelNotifications.errorCount;
    if (tab === 'old') return s.oldEmails.errorCount;
    if (tab === 'invites') return s.pastInvites.errorCount;
    if (tab === 'redundant') return s.redundantThreads.errorCount;
    if (tab === 'challenge') return s.oldestEmails.errorCount;
    return s.heaviestEmails.errorCount;
  });

  protected readonly visibleSenders = computed(() => this.senders().slice(0, this.displayCount()));
  protected readonly visibleHeaviest = computed(() => this.heaviest().slice(0, this.displayCount()));
  protected readonly visibleRepeated = computed(() => this.repeated().slice(0, this.displayCount()));
  protected readonly visibleOTPs = computed(() => this.otps().slice(0, this.displayCount()));
  protected readonly visibleParcels = computed(() => this.parcels().slice(0, this.displayCount()));
  protected readonly visibleOld = computed(() => this.oldEmails().slice(0, this.displayCount()));
  protected readonly visibleInvites = computed(() => this.pastInvites().slice(0, this.displayCount()));
  protected readonly visibleRedundant = computed(() => this.redundantThreads().slice(0, this.displayCount()));

  protected readonly hasMore = computed(() => {
    const tab = this.activeTab();
    if (tab === 'unread') return this.senders().length > this.displayCount();
    if (tab === 'repeated') return this.repeated().length > this.displayCount();
    if (tab === 'otp') return this.otps().length > this.displayCount();
    if (tab === 'parcels') return this.parcels().length > this.displayCount();
    if (tab === 'old') return this.oldEmails().length > this.displayCount();
    if (tab === 'invites') return this.pastInvites().length > this.displayCount();
    if (tab === 'redundant') return this.redundantThreads().length > this.displayCount();
    if (tab === 'challenge') return false;
    return this.heaviest().length > this.displayCount();
  });

  protected readonly activeCachedAt = computed(() => this.globalCachedAt());

  protected readonly otpMax = computed(() => Math.max(1, ...this.otps().map((s) => s.count)));
  protected readonly parcelsMax = computed(() => Math.max(1, ...this.parcels().map((s) => s.count)));
  protected readonly oldMax = computed(() => Math.max(1, ...this.oldEmails().map((s) => s.count)));
  protected readonly invitesMax = computed(() => Math.max(1, ...this.pastInvites().map((s) => s.count)));
  protected readonly redundantMax = computed(() => Math.max(1, ...this.redundantThreads().map((s) => s.count)));
  protected readonly sendersMax = computed(() => Math.max(1, ...this.senders().map((s) => s.count)));
  protected readonly heaviestMax = computed(() => Math.max(1, ...this.heaviest().map((h) => h.sizeEstimate)));
  protected readonly repeatedMax = computed(() => Math.max(1, ...this.repeated().map((s) => s.count)));

  protected readonly currentItems = computed(() => {
    const tab = this.activeTab();
    if (tab === 'otp') return this.visibleOTPs();
    if (tab === 'parcels') return this.visibleParcels();
    if (tab === 'old') return this.visibleOld();
    if (tab === 'invites') return this.visibleInvites();
    if (tab === 'redundant') return this.visibleRedundant();
    return this.visibleRepeated();
  });

  protected readonly currentMax = computed(() => {
    const tab = this.activeTab();
    if (tab === 'otp') return this.otpMax();
    if (tab === 'parcels') return this.parcelsMax();
    if (tab === 'old') return this.oldMax();
    if (tab === 'invites') return this.invitesMax();
    if (tab === 'redundant') return this.redundantMax();
    return this.repeatedMax();
  });

  protected readonly challengeCurrent = computed(() =>
    this.oldestEmails().length > 0 ? this.oldestEmails()[0] : null
  );

  protected readonly customFilters = signal<QuickFilter[]>([]);
  protected readonly isAddingFilter = signal(false);
  protected readonly editingFilter = signal<QuickFilter | null>(null);
  protected readonly formLabel = signal('');
  protected readonly formQuery = signal('');

  // true when data came from cache (not a live fetch just performed)
  protected readonly isFromCache = computed(() => {
    const ts = this.activeCachedAt();
    if (ts === null) return false;
    return Date.now() - ts > 5_000;
  });

  protected readonly formatSize = formatSize;
  protected readonly formatTimeAgo = formatTimeAgo;

  constructor() {
    effect(() => {
      const sentinelEl = this.sentinel()?.nativeElement;
      const bodyEl = this.body().nativeElement;
      this.observer?.disconnect();
      if (!sentinelEl) return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            this.displayCount.update((n) => n + this.PAGE_SIZE);
          }
        },
        { root: bodyEl, threshold: 0 },
      );
      this.observer.observe(sentinelEl);
    });
  }

  ngOnInit(): void {
    chrome.storage.local.get('custom_filters', (data) => {
      const stored = data['custom_filters'];
      if (stored && Array.isArray(stored)) {
        this.customFilters.set(stored);
      } else {
        // Default filters
        this.customFilters.set([
          { id: '1', label: 'Newsletters', query: 'newsletter' },
          { id: '2', label: 'Unsubscribe links', query: 'unsubscribe OR "se désinscrire" OR "se désabonner"' }
        ]);
        this.saveFiltersToStorage();
      }
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  protected setTab(tab: Tab): void {
    this.activeTab.set(tab);
    this.displayCount.set(this.PAGE_SIZE);
  }

  protected searchSender(item: SenderStat): void {
    this.gmailSearch.search(`from:${item.email} is:unread`);
  }

  protected searchHeaviest(item: SizeStat): void {
    this.gmailSearch.search(`from:${item.from} larger:${Math.round(item.sizeEstimate * 0.9)}`);
  }

  protected searchRepeated(item: SubjectStat): void {
    this.gmailSearch.search(`subject:"${item.subject}"`);
  }

  protected searchFilter(query: string): void {
    this.gmailSearch.search(query);
  }

  protected startAddFilter(): void {
    this.isAddingFilter.set(true);
    this.editingFilter.set(null);
    this.formLabel.set('');
    this.formQuery.set('');
  }

  protected startEditFilter(filter: QuickFilter): void {
    this.editingFilter.set(filter);
    this.isAddingFilter.set(false);
    this.formLabel.set(filter.label);
    this.formQuery.set(filter.query);
  }

  protected cancelFilterForm(): void {
    this.isAddingFilter.set(false);
    this.editingFilter.set(null);
  }

  protected saveFilterForm(): void {
    const label = this.formLabel().trim();
    const query = this.formQuery().trim();
    if (!label || !query) return;

    const current = this.customFilters();
    const edit = this.editingFilter();

    if (edit) {
      this.customFilters.set(
        current.map(f => f.id === edit.id ? { ...f, label, query } : f)
      );
    } else {
      const newFilter: QuickFilter = {
        id: Math.random().toString(36).slice(2, 9),
        label,
        query
      };
      this.customFilters.set([...current, newFilter]);
    }

    this.saveFiltersToStorage();
    this.cancelFilterForm();
  }

  protected deleteFilter(id: string): void {
    if (confirm('Delete this filter?')) {
      this.customFilters.update(filters => filters.filter(f => f.id !== id));
      this.saveFiltersToStorage();
    }
  }

  protected setFormLabel(val: string): void {
    this.formLabel.set(val);
  }

  protected setFormQuery(val: string): void {
    this.formQuery.set(val);
  }

  private saveFiltersToStorage(): void {
    chrome.storage.local.set({ 'custom_filters': this.customFilters() });
  }

  protected unsubscribe(item: SenderStat): void {
    if (item.unsubscribeUrl) {
      window.open(item.unsubscribeUrl, '_blank');
    }
  }

  protected clearSender(item: SenderStat): void {
    if (confirm(`Delete ALL unread emails from ${item.sender}?`)) {
      this.isLoading.set(true);
      this.statsService.deleteByQuery(`from:${item.email} is:unread`).subscribe({
        next: (res) => {
          if (res.success) {
            this.load(true); // reload to update counts
          } else {
            this.isLoading.set(false);
            this.error.set(res.error || 'Failed to delete');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.error.set('Unexpected error');
        }
      });
    }
  }

  protected skipChallenge(item: SizeStat): void {
    this.oldestEmails.update(list => list.filter(e => e.id !== item.id));
  }

  protected trashChallenge(item: SizeStat): void {
    if (item.id) {
      this.statsService.deleteMessage(item.id).subscribe(res => {
        if (res.success) {
          this.oldestEmails.update(list => list.filter(e => e.id !== item.id));
        }
      });
    }
  }

  protected load(forceRefresh = false): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.loadFetched.set(0);
    this.loadTotal.set(0);
    this.displayCount.set(this.PAGE_SIZE);

    if (forceRefresh) {
      this.globalCachedAt.set(null);
    }

    this.statsService.streamGlobalStats(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'PROGRESS') {
          this.loadFetched.set(msg.fetched);
          this.loadTotal.set(msg.total);
          if (msg.data) {
            this.stats.set(msg.data);
            if (msg.data.oldestEmails.items.length > 0) {
              this.oldestEmails.set(msg.data.oldestEmails.items);
            }
          }
        } else if (msg.type === 'RESULT') {
          this.isLoading.set(false);
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') {
              this.auth.logout();
              this.router.navigate(['/auth']);
              return;
            }
            this.error.set(msg.error || 'Unknown error');
          } else if (msg.data) {
            this.stats.set(msg.data);
            this.oldestEmails.set(msg.data.oldestEmails.items);
            this.globalCachedAt.set(msg.cachedAt ?? Date.now());
          }
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.error.set('Unexpected error');
      },
    });
  }

  openInNewTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
      // Notify content script to close the side panel
      window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
    }
  }
}
