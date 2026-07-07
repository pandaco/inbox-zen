import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, effect, inject, signal, computed, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { StatsService, SizeStat, GlobalStats } from './stats.service';
import { GmailSearchService } from '../../core/gmail-search/gmail-search.service';
import { TranslatePipe, t } from '../../core/i18n/i18n';
import { StatListComponent, StatRow } from './components/stat-list.component';
import { ChallengeTabComponent } from './components/challenge-tab.component';
import { FiltersTabComponent } from './components/filters-tab.component';

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return t('justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('minutesAgo', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hoursAgo', hours);
  return t('daysAgo', Math.floor(hours / 24));
}

type Tab = 'unread' | 'heaviest' | 'repeated' | 'filters' | 'parcels' | 'old' | 'invites' | 'redundant' | 'challenge';

interface TabDef {
  id: Tab;
  labelKey: string;
  hintKey?: string;
}

@Component({
  selector: 'app-stats',
  imports: [TranslatePipe, StatListComponent, ChallengeTabComponent, FiltersTabComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stats">
      <header class="stats__header">
        <h1 class="stats__title">
          <img src="icons/icon48.png" alt="Inbox Zen" class="stats__logo" />
          Inbox Zen
          <span class="stats__version">v{{ version }}</span>
        </h1>
        <div class="stats__actions">
          <button class="stats__action-btn" (click)="openInNewTab()"
                  [attr.aria-label]="'openInNewTab' | t" [title]="'openInNewTab' | t">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
          <button class="stats__action-btn" (click)="auth.logout()"
                  [attr.aria-label]="'signOut' | t" [title]="'signOut' | t">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      @if (!error()) {
        <nav class="stats__tabs" role="tablist">
          @for (tab of tabs; track tab.id) {
            <button role="tab"
                    [id]="'tab-' + tab.id"
                    [attr.aria-selected]="activeTab() === tab.id"
                    [attr.aria-controls]="'tabpanel-' + tab.id"
                    [class.active]="activeTab() === tab.id"
                    (click)="setTab(tab.id)"
                    [title]="tab.hintKey ? (tab.hintKey | t) : null">
              {{ tab.labelKey | t }}
            </button>
          }
        </nav>
      }

      @if (showMeta() && (totalFetched() > 0 || isLoading())) {
        <div class="stats__meta" [class.stats__meta--error]="errorCount() > 0">
          <div class="stats__meta-row">
            <span class="stats__meta-text">
              @if (isLoading()) {
                {{ 'analyzing' | t : loadFetched() : loadTotal() }}
              } @else {
                {{ 'emailsAnalysed' | t : totalFetched() }}
                @if (errorCount() > 0) {
                  · <strong>{{ 'errorsCount' | t : errorCount() }}</strong>
                }
              }
            </span>
            @if (isLoading() && loadTotal() > 0) {
              <div class="stats__load-bar-bg stats__load-bar-bg--mini">
                <div class="stats__load-bar" [style.width.%]="(loadFetched() / loadTotal()) * 100"></div>
              </div>
            }
            <button class="stats__meta-close" (click)="showMeta.set(false)"
                    [attr.aria-label]="'closeInfoBar' | t">×</button>
          </div>
        </div>
      }

      <div class="stats__body" #body
           role="tabpanel"
           [id]="'tabpanel-' + activeTab()"
           [attr.aria-labelledby]="'tab-' + activeTab()">
        @if (isLoading() && totalFetched() === 0) {
          <div class="stats__loading" role="status" [attr.aria-label]="'loading' | t">
            <span class="stats__spinner"></span>
            <p class="stats__loading-text">{{ 'scanningInbox' | t }}</p>
          </div>
        } @else {
          @if (error()) {
            <div class="stats__error" role="alert">
              <p>{{ error() }}</p>
              <button class="stats__retry" (click)="load(true)">{{ 'retry' | t }}</button>
            </div>
          } @else if (activeTab() === 'challenge') {
            <app-challenge-tab [items]="oldestEmails()"
                               (keep)="skipChallenge($event)"
                               (trash)="trashChallenge($event)" />
          } @else if (activeTab() === 'filters') {
            <app-filters-tab (searchRequested)="searchFilter($event)" />
          } @else if (activeRows().length === 0) {
            <p class="stats__empty">{{ emptyKey() | t }}</p>
          } @else {
            <app-stat-list [rows]="activeRows()"
                           [listAria]="activeTab() === 'unread' ? ('topSendersAria' | t) : ''"
                           (rowActivated)="onRowActivated($event)"
                           (unsubscribeClicked)="unsubscribe($event)"
                           (deleteConfirmed)="clearSender($event)" />
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
            {{ (isFromCache() ? 'cached' : 'synced') | t }} · {{ formatTimeAgo(activeCachedAt()!) }}
          </span>
        }
        <button class="stats__refresh" (click)="load(true)" [disabled]="isLoading()">
          {{ 'syncNow' | t }}
        </button>
      </footer>
    </div>
  `,
  styles: `
    .stats {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Google Sans', Roboto, sans-serif;
    }

    .stats__header {
      padding: 0.8rem 1.2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }

    .stats__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .stats__logo {
      width: 24px;
      height: 24px;
      object-fit: contain;
      display: block;
    }

    .stats__version {
      font-size: 0.65rem;
      font-weight: 400;
      color: var(--text-faint);
      font-family: monospace;
    }

    .stats__actions { display: flex; gap: 0.5rem; }
    .stats__action-btn {
      background: none; border: none; padding: 0.4rem; border-radius: 50%;
      color: var(--text-dim); cursor: pointer; transition: background 0.2s;
      display: flex; align-items: center; justify-content: center;
    }
    .stats__action-btn:hover { background: var(--surface-hover); color: var(--text); }

    .stats__tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .stats__tabs::-webkit-scrollbar { display: none; }

    .stats__tabs button {
      flex: 0 0 auto; padding: 0.7rem 1rem; border: none; background: transparent;
      font-size: 0.85rem; font-weight: 500; color: var(--text-dim); cursor: pointer;
      border-bottom: 2px solid transparent; font-family: inherit;
      white-space: nowrap;
    }
    .stats__tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }

    .stats__meta {
      padding: 0.6rem 1.2rem;
      font-size: 0.75rem;
      color: var(--text-dim);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .stats__meta--error { color: var(--warn); background: var(--warn-bg); }
    .stats__meta-row { display: flex; align-items: center; gap: 1rem; }
    .stats__meta-text { flex: 1; font-weight: 500; }
    .stats__meta-close {
      background: none; border: none; font-size: 1.2rem; color: var(--text-dim);
      cursor: pointer; padding: 0 0.4rem; line-height: 1;
    }
    .stats__meta-close:hover { color: var(--text); }

    .stats__body { flex: 1; overflow-y: auto; padding: 0.75rem 0; position: relative; }

    .stats__loading {
      display: flex; flex-direction: column;
      align-items: center; gap: 0.75rem; padding: 3rem 1.5rem 2rem;
    }
    .stats__loading-text { margin: 0; font-size: 0.82rem; color: var(--text-dim); }
    .stats__load-bar-bg {
      width: 100px; height: 4px;
      background: var(--border); border-radius: 2px; overflow: hidden;
    }
    .stats__load-bar {
      height: 100%; background: var(--accent); border-radius: 2px;
      transition: width 0.3s ease;
    }
    .stats__load-bar-bg--mini { width: 60px; }

    .stats__spinner {
      width: 28px; height: 28px;
      border: 3px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }

    .stats__error {
      padding: 1.2rem; text-align: center; color: var(--danger); font-size: 0.85rem;
    }
    .stats__retry {
      margin-top: 0.8rem; padding: 0.5rem 1rem; border: 1px solid var(--border-input);
      border-radius: 4px; background: var(--bg); color: var(--accent); font-weight: 500;
      cursor: pointer; font-family: inherit;
    }

    .stats__sentinel { height: 1px; }

    .stats__footer {
      padding: 0.5rem 1.2rem; border-top: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
      background: var(--bg);
    }
    .stats__sync-time { font-size: 0.72rem; color: var(--text-dim); }
    .stats__sync-time--cached { color: var(--accent); font-weight: 500; }
    .stats__refresh {
      background: none; border: 1px solid var(--border-input); padding: 0.3rem 0.6rem;
      border-radius: 4px; font-size: 0.75rem; font-weight: 500; color: var(--text-dim);
      cursor: pointer; font-family: inherit; transition: background 0.2s;
    }
    .stats__refresh:hover:not(:disabled) { background: var(--surface); border-color: var(--accent); color: var(--accent); }
    .stats__refresh:disabled { opacity: 0.5; cursor: not-allowed; }
  `,
})
export class StatsComponent implements OnInit, OnDestroy {
  protected readonly version = chrome.runtime.getManifest().version;
  protected readonly auth = inject(AuthService);
  private readonly statsService = inject(StatsService);
  private readonly gmailSearch = inject(GmailSearchService);
  private readonly router = inject(Router);

  private readonly PAGE_SIZE = 10;
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer?: IntersectionObserver;

  protected readonly tabs: TabDef[] = [
    { id: 'unread', labelKey: 'tabUnread' },
    { id: 'repeated', labelKey: 'tabRepeated' },
    { id: 'heaviest', labelKey: 'tabHeaviest' },
    { id: 'parcels', labelKey: 'tabParcels', hintKey: 'tabParcelsHint' },
    { id: 'old', labelKey: 'tabOld', hintKey: 'tabOldHint' },
    { id: 'invites', labelKey: 'tabInvites', hintKey: 'tabInvitesHint' },
    { id: 'redundant', labelKey: 'tabRedundant', hintKey: 'tabRedundantHint' },
    { id: 'filters', labelKey: 'tabFilters', hintKey: 'tabFiltersHint' },
    { id: 'challenge', labelKey: 'tabChallenge', hintKey: 'tabChallengeHint' },
  ];

  protected readonly activeTab = signal<Tab>('unread');
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loadFetched = signal(0);
  protected readonly loadTotal = signal(0);
  protected readonly showMeta = signal(true);

  protected readonly displayCount = signal(this.PAGE_SIZE);
  protected readonly globalCachedAt = signal<number | null>(null);
  protected readonly stats = signal<GlobalStats | null>(null);

  protected readonly activeCachedAt = computed(() => this.globalCachedAt());

  private readonly senders = computed(() => {
    const items = this.stats()?.unreadSenders.items ?? [];
    return [...items].sort((a, b) => b.count - a.count);
  });
  private readonly heaviest = computed(() => this.stats()?.heaviestEmails.items ?? []);
  private readonly repeated = computed(() => this.stats()?.repeatedSubjects.items ?? []);
  private readonly parcels = computed(() => this.stats()?.parcelNotifications.items ?? []);
  private readonly oldEmails = computed(() => this.stats()?.oldEmails.items ?? []);
  private readonly pastInvites = computed(() => this.stats()?.pastInvites.items ?? []);
  private readonly redundantThreads = computed(() => this.stats()?.redundantThreads.items ?? []);
  protected readonly oldestEmails = signal<SizeStat[]>([]); // local updates in challenge

  private statsForTab(tab: Tab): { totalFetched: number; errorCount: number } | undefined {
    const s = this.stats();
    if (!s) return undefined;
    switch (tab) {
      case 'unread': return s.unreadSenders;
      case 'repeated': return s.repeatedSubjects;
      case 'parcels': return s.parcelNotifications;
      case 'old': return s.oldEmails;
      case 'invites': return s.pastInvites;
      case 'redundant': return s.redundantThreads;
      case 'challenge': return s.oldestEmails;
      default: return s.heaviestEmails;
    }
  }

  protected readonly totalFetched = computed(() => this.statsForTab(this.activeTab())?.totalFetched ?? 0);
  protected readonly errorCount = computed(() => this.statsForTab(this.activeTab())?.errorCount ?? 0);

  private readonly sendersMax = computed(() => Math.max(1, ...this.senders().map(s => s.count)));
  private readonly repeatedMax = computed(() => Math.max(1, ...this.repeated().map(i => i.count)));
  private readonly parcelsMax = computed(() => Math.max(1, ...this.parcels().map(i => i.count)));
  private readonly redundantMax = computed(() => Math.max(1, ...this.redundantThreads().map(i => i.count)));

  /** Row lists per tab, mapped to the generic StatRow shape for app-stat-list. */
  private readonly rowsByTab = computed<Record<string, { rows: StatRow[]; total: number }>>(() => {
    const slice = <T>(items: T[]): T[] => items.slice(0, this.displayCount());
    const senderRows: StatRow[] = slice(this.senders()).map(item => ({
      name: item.sender,
      email: item.email,
      value: String(item.count),
      barPct: (item.count / this.sendersMax()) * 100,
      unsubscribeUrl: item.unsubscribeUrl,
      deletable: true,
      ariaValue: t('unreadEmailsAria', item.count),
    }));
    const heaviestRows: StatRow[] = slice(this.heaviest()).map(item => ({
      name: item.subject,
      value: formatSize(item.sizeEstimate),
      fromLine: item.from,
    }));
    const repeatedRows: StatRow[] = slice(this.repeated()).map(item => ({
      name: item.subject,
      value: String(item.count),
      barPct: (item.count / this.repeatedMax()) * 100,
    }));
    const parcelRows: StatRow[] = slice(this.parcels()).map(item => ({
      name: item.subject,
      value: String(item.count),
      barPct: (item.count / this.parcelsMax()) * 100,
    }));
    const oldRows: StatRow[] = slice(this.oldEmails()).map(item => ({
      name: item.subject,
      fromLine: t('inboxMessage'),
    }));
    const inviteRows: StatRow[] = slice(this.pastInvites()).map(item => ({
      name: item.subject,
      fromLine: t('calendarInvite'),
    }));
    const redundantRows: StatRow[] = slice(this.redundantThreads()).map(item => ({
      name: item.subject,
      value: String(item.count),
      barPct: (item.count / this.redundantMax()) * 100,
    }));
    return {
      unread: { rows: senderRows, total: this.senders().length },
      heaviest: { rows: heaviestRows, total: this.heaviest().length },
      repeated: { rows: repeatedRows, total: this.repeated().length },
      parcels: { rows: parcelRows, total: this.parcels().length },
      old: { rows: oldRows, total: this.oldEmails().length },
      invites: { rows: inviteRows, total: this.pastInvites().length },
      redundant: { rows: redundantRows, total: this.redundantThreads().length },
    };
  });

  protected readonly activeRows = computed<StatRow[]>(
    () => this.rowsByTab()[this.activeTab()]?.rows ?? [],
  );

  protected readonly hasMore = computed(() => {
    const entry = this.rowsByTab()[this.activeTab()];
    return entry ? this.displayCount() < entry.total : false;
  });

  protected readonly emptyKey = computed(() => {
    switch (this.activeTab()) {
      case 'unread': return 'emptyUnread';
      case 'repeated': return 'emptyRepeated';
      case 'parcels': return 'emptyParcels';
      case 'old': return 'emptyOld';
      case 'invites': return 'emptyInvites';
      case 'redundant': return 'emptyRedundant';
      default: return 'emptyHeaviest';
    }
  });

  protected readonly challengeCurrent = computed(() =>
    this.oldestEmails().length > 0 ? this.oldestEmails()[0] : null
  );

  // true when data came from cache (not a live fetch just performed)
  protected readonly isFromCache = computed(() => {
    const ts = this.globalCachedAt();
    if (ts === null) return false;
    return Date.now() - ts > 5_000;
  });

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

  protected formatTimeAgo = formatTimeAgo;

  protected onRowActivated(row: StatRow): void {
    switch (this.activeTab()) {
      case 'unread':
        this.gmailSearch.search(`from:${row.email} is:unread`);
        break;
      case 'heaviest':
        this.gmailSearch.search(`from:(${row.fromLine}) subject:("${row.name}")`);
        break;
      case 'parcels':
        this.gmailSearch.search(row.name);
        break;
      default:
        this.gmailSearch.search(`subject:("${row.name}")`);
    }
  }

  protected searchFilter(query: string): void {
    this.gmailSearch.search(query);
  }

  protected unsubscribe(row: StatRow): void {
    if (!row.unsubscribeUrl) return;
    // The URL comes from an email header — only allow http(s).
    try {
      const url = new URL(row.unsubscribeUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
      window.open(url.href, '_blank');
    } catch {
      /* malformed URL — ignore */
    }
  }

  /** Permanently deletes all unread emails from a sender (confirmed inline in the list). */
  protected clearSender(row: StatRow): void {
    if (!row.email) return;
    this.isLoading.set(true);
    this.statsService.deleteByQuery(`from:${row.email} is:unread`).subscribe({
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
      window.parent.postMessage({ type: 'CLOSE_PANEL' }, 'https://mail.google.com');
    }
  }
}
