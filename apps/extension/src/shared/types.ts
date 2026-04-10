export type MessageType =
  | 'AUTHENTICATE'
  | 'LOGOUT'
  | 'GET_AUTH_STATUS'
  | 'GET_TOP_UNREAD_SENDERS'
  | 'GET_TOP_HEAVIEST_EMAILS'
  | 'GET_TOP_REPEATED_SUBJECTS'
  | 'GET_EXPIRED_OTPS'
  | 'GET_PARCEL_NOTIFICATIONS'
  | 'GET_OLD_EMAILS'
  | 'GET_PAST_INVITES'
  | 'GET_REDUNDANT_THREADS'
  | 'GET_OLDEST_EMAILS'
  | 'GET_GLOBAL_STATS'
  | 'DELETE_EMAILS_BY_QUERY'
  | 'DELETE_MESSAGE';

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
