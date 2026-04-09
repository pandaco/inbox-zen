import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, effect, inject, signal, computed, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StatsService, SenderStat, SizeStat, SubjectStat } from './stats.service';
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
        <button role="tab" [attr.aria-selected]="activeTab() === 'challenge'"
          [class.active]="activeTab() === 'challenge'" (click)="setTab('challenge')" title="Zero-Inbox Challenge">
          Challenge ⚡
        </button>
        <button role="tab" [attr.aria-selected]="activeTab() === 'filters'"
          [class.active]="activeTab() === 'filters'" (click)="setTab('filters')">
          Filters
        </button>
      </nav>

      @if (!isLoading() && totalFetched() > 0) {
        <div class="stats__meta" [class.stats__meta--error]="errorCount() > 0">
          {{ totalFetched() }} emails analysed
          @if (errorCount() > 0) {
            · <strong>{{ errorCount() }} errors</strong> (partial data)
          }
        </div>
      }

      <div class="stats__body" #body>
        @if (isLoading()) {
          <div class="stats__loading" role="status" aria-label="Loading">
            <span class="stats__spinner"></span>
            @if (loadTotal() > 0) {
              <p class="stats__loading-text">
                {{ loadFetched() }} / {{ loadTotal() }} emails analysed
              </p>
              <div class="stats__load-bar-bg">
                <div class="stats__load-bar"
                  [style.width.%]="(loadFetched() / loadTotal()) * 100">
                </div>
              </div>
            } @else {
              <p class="stats__loading-text">Fetching unread emails…</p>
            }
          </div>
        } @else if (error()) {
          <div class="stats__error" role="alert">
            <p>{{ error() }}</p>
            <button class="stats__retry" (click)="load(true)">Retry</button>
          </div>
        } @else if (activeTab() === 'unread') {
          @if (senders().length === 0) {
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
                      <span class="chart__name">{{ item.sender }}</span>
                      @if (item.unsubscribeUrl) {
                        <button class="chart__unsub" (click)="$event.stopPropagation(); unsubscribe(item)"
                                title="Unsubscribe from this list">
                          Unsubscribe
                        </button>
                      }
                      <button class="chart__clear" (click)="$event.stopPropagation(); clearSender(item)"
                              title="Clear all unread emails from this sender">
                        Clear All
                      </button>
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
        } @else if (activeTab() === 'repeated' || activeTab() === 'otp' || activeTab() === 'parcels') {
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
                      @if (activeTab() === 'repeated') {
                        <span class="chart__value">{{ item.count }}</span>
                      }
                    </div>
                    <div class="chart__bar-bg" role="presentation">
                      <div class="chart__bar chart__bar--purple"
                        [style.width.%]="activeTab() === 'repeated' ? (item.count / (currentMax() || 1)) * 100 : 100">
                      </div>
                    </div>
                  </div>
                </li>
              }
            </ol>
          }
        } @else if (activeTab() === 'heaviest') {
          @if (heaviest().length === 0) {
            <p class="stats__empty">No heavy emails found.</p>
          } @else {
            <ol class="chart" aria-label="Top emails by size">
              @for (item of visibleHeaviest(); track item.subject + item.from; let i = $index) {
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
            } @else if (activeTab() === 'challenge') {
          <div class="challenge">
            @if (!challengeCurrent()) {
              <p class="stats__empty">Challenge completed! No more old emails in inbox. 🎉</p>
            } @else {
              <div class="challenge__card">
                <div class="challenge__meta">Oldest Email ({{ oldestEmails().length }} left)</div>
                <h2 class="challenge__subject">{{ challengeCurrent()?.subject }}</h2>
                <div class="challenge__from">{{ challengeCurrent()?.from }}</div>
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
            <li><button class="filters__btn" (click)="searchFilter('newsletter')">Newsletters</button></li>
            <li><button class="filters__btn" (click)="searchFilter('unsubscribe OR &quot;se désinscrire&quot; OR &quot;se désabonner&quot;')">Unsubscribe links</button></li>
            </ul>
            </div>
            }
            @if (hasMore() && activeTab() !== 'filters') {
            <div #sentinel class="stats__sentinel" aria-hidden="true"></div>        }
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
    }
    .stats__tabs button {
      flex: 1; padding: 0.7rem; border: none; background: transparent;
      font-size: 0.85rem; font-weight: 500; color: #5f6368; cursor: pointer;
      border-bottom: 2px solid transparent; font-family: inherit;
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
    .stats__load-bar-bg {
      width: 100%; height: 4px;
      background: #e0e0e0; border-radius: 2px; overflow: hidden;
    }
    .stats__load-bar {
      height: 100%; background: #1a73e8; border-radius: 2px;
      transition: width 0.3s ease;
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
    .filters__btn {
      width: 100%; padding: 0.6rem 1rem; text-align: left;
      background: #f8f9fa; border: 1px solid #dadce0; border-radius: 6px;
      font-size: 0.85rem; color: #1a73e8; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: background 0.2s;
    }
    .filters__btn:hover { background: #f1f3f4; }

    /* Challenge Mode */
    .challenge { padding: 2rem 1.2rem; display: flex; justify-content: center; }
    .challenge__card {
      width: 100%; max-width: 350px; background: #fff; border: 1px solid #e0e0e0;
      border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      display: flex; flex-direction: column; gap: 1rem;
    }
    .challenge__meta { font-size: 0.7rem; font-weight: 600; color: #1a73e8; text-transform: uppercase; letter-spacing: 0.5px; }
    .challenge__subject { margin: 0; font-size: 1rem; font-weight: 600; color: #202124; line-height: 1.4; }
    .challenge__from { font-size: 0.82rem; color: #5f6368; word-break: break-all; }
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
  protected readonly senders = signal<SenderStat[]>([]);
  protected readonly heaviest = signal<SizeStat[]>([]);
  protected readonly repeated = signal<SubjectStat[]>([]);
  protected readonly otps = signal<SubjectStat[]>([]);
  protected readonly parcels = signal<SubjectStat[]>([]);
  protected readonly oldEmails = signal<SubjectStat[]>([]);
  protected readonly pastInvites = signal<SubjectStat[]>([]);
  protected readonly redundantThreads = signal<SubjectStat[]>([]);
  protected readonly oldestEmails = signal<SizeStat[]>([]);
  protected readonly unreadFetched = signal(0);
  protected readonly unreadErrors = signal(0);
  protected readonly heaviestFetched = signal(0);
  protected readonly heaviestErrors = signal(0);
  protected readonly repeatedFetched = signal(0);
  protected readonly repeatedErrors = signal(0);
  protected readonly otpFetched = signal(0);
  protected readonly otpErrors = signal(0);
  protected readonly parcelsFetched = signal(0);
  protected readonly parcelsErrors = signal(0);
  protected readonly oldFetched = signal(0);
  protected readonly oldErrors = signal(0);
  protected readonly invitesFetched = signal(0);
  protected readonly invitesErrors = signal(0);
  protected readonly redundantFetched = signal(0);
  protected readonly redundantErrors = signal(0);
  protected readonly challengeFetched = signal(0);
  protected readonly challengeErrors = signal(0);
  protected readonly loadFetched = signal(0);
  protected readonly loadTotal = signal(0);
  protected readonly displayCount = signal(this.PAGE_SIZE);
  protected readonly unreadCachedAt = signal<number | null>(null);
  protected readonly heaviestCachedAt = signal<number | null>(null);
  protected readonly repeatedCachedAt = signal<number | null>(null);
  protected readonly otpCachedAt = signal<number | null>(null);
  protected readonly parcelsCachedAt = signal<number | null>(null);
  protected readonly oldCachedAt = signal<number | null>(null);
  protected readonly invitesCachedAt = signal<number | null>(null);
  protected readonly redundantCachedAt = signal<number | null>(null);
  protected readonly challengeCachedAt = signal<number | null>(null);

  protected readonly totalFetched = computed(() => {
    const tab = this.activeTab();
    if (tab === 'unread') return this.unreadFetched();
    if (tab === 'repeated') return this.repeatedFetched();
    if (tab === 'otp') return this.otpFetched();
    if (tab === 'parcels') return this.parcelsFetched();
    if (tab === 'old') return this.oldFetched();
    if (tab === 'invites') return this.invitesFetched();
    if (tab === 'redundant') return this.redundantFetched();
    if (tab === 'challenge') return this.challengeFetched();
    return this.heaviestFetched();
  });
  protected readonly errorCount = computed(() => {
    const tab = this.activeTab();
    if (tab === 'unread') return this.unreadErrors();
    if (tab === 'repeated') return this.repeatedErrors();
    if (tab === 'otp') return this.otpErrors();
    if (tab === 'parcels') return this.parcelsErrors();
    if (tab === 'old') return this.oldErrors();
    if (tab === 'invites') return this.invitesErrors();
    if (tab === 'redundant') return this.redundantErrors();
    if (tab === 'challenge') return this.challengeErrors();
    return this.heaviestErrors();
  });
  protected readonly visibleSenders = computed(() =>
    this.senders().slice(0, this.displayCount()),
  );
  protected readonly visibleHeaviest = computed(() =>
    this.heaviest().slice(0, this.displayCount()),
  );
  protected readonly visibleRepeated = computed(() =>
    this.repeated().slice(0, this.displayCount()),
  );
  protected readonly visibleOTPs = computed(() =>
    this.otps().slice(0, this.displayCount()),
  );
  protected readonly visibleParcels = computed(() =>
    this.parcels().slice(0, this.displayCount()),
  );
  protected readonly visibleOld = computed(() =>
    this.oldEmails().slice(0, this.displayCount()),
  );
  protected readonly visibleInvites = computed(() =>
    this.pastInvites().slice(0, this.displayCount()),
  );

  protected readonly visibleRedundant = computed(() =>
    this.redundantThreads().slice(0, this.displayCount()),
  );
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
  protected readonly activeCachedAt = computed(() => {
    const tab = this.activeTab();
    if (tab === 'unread') return this.unreadCachedAt();
    if (tab === 'repeated') return this.repeatedCachedAt();
    if (tab === 'otp') return this.otpCachedAt();
    if (tab === 'parcels') return this.parcelsCachedAt();
    if (tab === 'old') return this.oldCachedAt();
    if (tab === 'invites') return this.invitesCachedAt();
    if (tab === 'redundant') return this.redundantCachedAt();
    if (tab === 'challenge') return this.challengeCachedAt();
    return this.heaviestCachedAt();
  });

  protected readonly otpMax = computed(() =>
    Math.max(1, ...this.otps().map((s) => s.count)),
  );
  protected readonly parcelsMax = computed(() =>
    Math.max(1, ...this.parcels().map((s) => s.count)),
  );
  protected readonly oldMax = computed(() =>
    Math.max(1, ...this.oldEmails().map((s) => s.count)),
  );
  protected readonly invitesMax = computed(() =>
    Math.max(1, ...this.pastInvites().map((s) => s.count)),
  );

  protected readonly redundantMax = computed(() =>
    Math.max(1, ...this.redundantThreads().map((s) => s.count)),
  );

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

  // true when data came from cache (not a live fetch just performed)
  protected readonly isFromCache = computed(() => {
    const ts = this.activeCachedAt();
    if (ts === null) return false;
    return Date.now() - ts > 5_000; // older than 5s → was cached before this session
  });

  protected readonly sendersMax = computed(() =>
    Math.max(1, ...this.senders().map((s) => s.count)),
  );
  protected readonly heaviestMax = computed(() =>
    Math.max(1, ...this.heaviest().map((h) => h.sizeEstimate)),
  );
  protected readonly repeatedMax = computed(() =>
    Math.max(1, ...this.repeated().map((s) => s.count)),
  );

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
    this.unreadFetched.set(0);
    this.unreadErrors.set(0);
    this.heaviestFetched.set(0);
    this.heaviestErrors.set(0);
    this.repeatedFetched.set(0);
    this.repeatedErrors.set(0);
    this.otpFetched.set(0);
    this.otpErrors.set(0);
    this.parcelsFetched.set(0);
    this.parcelsErrors.set(0);
    this.oldFetched.set(0);
    this.oldErrors.set(0);
    this.invitesFetched.set(0);
    this.invitesErrors.set(0);
    this.redundantFetched.set(0);
    this.redundantErrors.set(0);
    this.challengeFetched.set(0);
    this.challengeErrors.set(0);
    this.loadFetched.set(0);
    this.loadTotal.set(0);
    this.displayCount.set(this.PAGE_SIZE);

    if (forceRefresh) {
      this.unreadCachedAt.set(null);
      this.heaviestCachedAt.set(null);
      this.repeatedCachedAt.set(null);
      this.otpCachedAt.set(null);
      this.parcelsCachedAt.set(null);
      this.oldCachedAt.set(null);
      this.invitesCachedAt.set(null);
      this.redundantCachedAt.set(null);
      this.challengeCachedAt.set(null);
    }

    let completed = 0;
    const TOTAL_STREAMS = 9;

    const checkDone = (err?: string): void => {
      if (err) this.error.set(err);
      if (++completed === TOTAL_STREAMS) {
        this.isLoading.set(false);
      }
    };

    const onSessionExpired = (): void => {
      this.auth.logout();
      this.router.navigate(['/auth']);
    };

    this.statsService.streamUnreadSenders(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'PROGRESS') {
          this.loadFetched.set(msg.fetched);
          this.loadTotal.set(msg.total);
        } else if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.senders.set(msg.data.items);
            this.unreadFetched.set(msg.data.totalFetched);
            this.unreadErrors.set(msg.data.errorCount);
            this.unreadCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamHeaviestEmails(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.heaviest.set(msg.data.items);
            this.heaviestFetched.set(msg.data.totalFetched);
            this.heaviestErrors.set(msg.data.errorCount);
            this.heaviestCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamRepeatedSubjects(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.repeated.set(msg.data.items);
            this.repeatedFetched.set(msg.data.totalFetched);
            this.repeatedErrors.set(msg.data.errorCount);
            this.repeatedCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamExpiredOTPs(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.otps.set(msg.data.items);
            this.otpFetched.set(msg.data.totalFetched);
            this.otpErrors.set(msg.data.errorCount);
            this.otpCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamParcelNotifications(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.parcels.set(msg.data.items);
            this.parcelsFetched.set(msg.data.totalFetched);
            this.parcelsErrors.set(msg.data.errorCount);
            this.parcelsCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamOldEmails(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.oldEmails.set(msg.data.items);
            this.oldFetched.set(msg.data.totalFetched);
            this.oldErrors.set(msg.data.errorCount);
            this.oldCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamPastInvites(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.pastInvites.set(msg.data.items);
            this.invitesFetched.set(msg.data.totalFetched);
            this.invitesErrors.set(msg.data.errorCount);
            this.invitesCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamRedundantThreads(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.redundantThreads.set(msg.data.items);
            this.redundantFetched.set(msg.data.totalFetched);
            this.redundantErrors.set(msg.data.errorCount);
            this.redundantCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });

    this.statsService.streamOldestEmails(forceRefresh).subscribe({
      next: (msg) => {
        if (msg.type === 'RESULT') {
          if (!msg.success) {
            if (msg.error === 'SESSION_EXPIRED') { onSessionExpired(); return; }
            checkDone(msg.error);
          } else if (msg.data) {
            this.oldestEmails.set(msg.data.items);
            this.challengeFetched.set(msg.data.totalFetched);
            this.challengeErrors.set(msg.data.errorCount);
            this.challengeCachedAt.set(msg.cachedAt ?? Date.now());
            checkDone();
          }
        }
      },
      error: () => checkDone('Unexpected error'),
    });
  }
  openInNewTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    }
  }
}
