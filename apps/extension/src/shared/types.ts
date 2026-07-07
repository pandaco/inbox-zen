export type MessageType =
  | 'AUTHENTICATE'
  | 'LOGOUT'
  | 'GET_AUTH_STATUS'
  | 'GET_GLOBAL_STATS'
  | 'TRASH_MESSAGES'
  | 'UNTRASH_MESSAGES';

export interface GlobalStats {
  unreadSenders: StatsResult<SenderStat>;
  heaviestEmails: StatsResult<SizeStat>;
  repeatedSubjects: StatsResult<SubjectStat>;
  expiredOTPs: StatsResult<SubjectStat>;
  parcelNotifications: StatsResult<SubjectStat>;
  oldEmails: StatsResult<SubjectStat>;
  pastInvites: StatsResult<SubjectStat>;
  redundantThreads: StatsResult<SubjectStat>;
  oldestEmails: StatsResult<SizeStat>;
}

export interface SubjectStat {
  subject: string;
  count: number;
  /** Underlying message ids — used for precise trash actions. */
  ids?: string[];
}

export interface QuickFilter {
  id: string;
  label: string;
  query: string;
}

export interface BgMessage {
  type: MessageType;
}

export interface BgResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SenderStat {
  sender: string;
  email: string;
  count: number;
  unsubscribeUrl?: string;
  score?: number;
  /** Underlying message ids — used for precise trash actions. */
  ids?: string[];
}

export interface TrashResult {
  /** Ids actually moved to (or out of) trash — undo operates on exactly these. */
  trashedIds: string[];
  /** Number of ids that failed (a failed chunk stops the operation). */
  failedCount: number;
  /**
   * Exact, freshly rebuilt stats — present once a corpus exists. The UI
   * prefers this over surgically pruning its local copy; it's undefined
   * before the first full sync, when the caller should fall back to
   * client-side pruning.
   */
  stats?: GlobalStats;
}

export interface SizeStat {
  subject: string;
  from: string;
  sizeEstimate: number;
  id?: string;
  snippet?: string;
}

export interface StatsResult<T> {
  items: T[];
  totalFetched: number;
  errorCount: number;
}

export interface ProgressMessage {
  type: 'PROGRESS';
  fetched: number;
  total: number;
  data?: GlobalStats;
}

export interface ResultMessage<T> {
  type: 'RESULT';
  success: boolean;
  data?: T;
  error?: string;
  cachedAt?: number; // unix ms timestamp — present when data was served from cache
}

export type PortMessage<T> = ProgressMessage | ResultMessage<T>;
