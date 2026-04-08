export type MessageType =
  | 'AUTHENTICATE'
  | 'LOGOUT'
  | 'GET_AUTH_STATUS'
  | 'GET_TOP_UNREAD_SENDERS'
  | 'GET_TOP_HEAVIEST_EMAILS'
  | 'GET_TOP_REPEATED_SUBJECTS';

export interface SubjectStat {
  subject: string;
  count: number;
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
}

export interface SizeStat {
  subject: string;
  from: string;
  sizeEstimate: number;
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
}

export interface ResultMessage<T> {
  type: 'RESULT';
  success: boolean;
  data?: T;
  error?: string;
  cachedAt?: number; // unix ms timestamp — present when data was served from cache
}

export type PortMessage<T> = ProgressMessage | ResultMessage<T>;
