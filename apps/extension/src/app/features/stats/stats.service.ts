import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChromeMessagingService } from '../../core/messaging/chrome-messaging.service';
import type { SenderStat, SizeStat, SubjectStat, StatsResult, PortMessage, BgResponse } from '../../../shared/types';

export type { SenderStat, SizeStat, SubjectStat, StatsResult, PortMessage, BgResponse };

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly messaging = inject(ChromeMessagingService);

  streamUnreadSenders(forceRefresh = false): Observable<PortMessage<StatsResult<SenderStat>>> {
    return this.messaging.stream<StatsResult<SenderStat>>('GET_TOP_UNREAD_SENDERS', forceRefresh);
  }

  streamHeaviestEmails(forceRefresh = false): Observable<PortMessage<StatsResult<SizeStat>>> {
    return this.messaging.stream<StatsResult<SizeStat>>('GET_TOP_HEAVIEST_EMAILS', forceRefresh);
  }

  streamRepeatedSubjects(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_TOP_REPEATED_SUBJECTS', forceRefresh);
  }

  streamExpiredOTPs(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_EXPIRED_OTPS', forceRefresh);
  }

  streamParcelNotifications(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_PARCEL_NOTIFICATIONS', forceRefresh);
  }

  streamOldEmails(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_OLD_EMAILS', forceRefresh);
  }

  streamPastInvites(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_PAST_INVITES', forceRefresh);
  }

  streamRedundantThreads(forceRefresh = false): Observable<PortMessage<StatsResult<SubjectStat>>> {
    return this.messaging.stream<StatsResult<SubjectStat>>('GET_REDUNDANT_THREADS', forceRefresh);
  }

  streamOldestEmails(forceRefresh = false): Observable<PortMessage<StatsResult<SizeStat>>> {
    return this.messaging.stream<StatsResult<SizeStat>>('GET_OLDEST_EMAILS', forceRefresh);
  }

  deleteByQuery(query: string): Observable<BgResponse<{ success: boolean; count: number }>> {
    return this.messaging.send<{ success: boolean; count: number }>({ type: 'DELETE_EMAILS_BY_QUERY', query } as any);
  }

  deleteMessage(id: string): Observable<BgResponse<boolean>> {
    return this.messaging.send<boolean>({ type: 'DELETE_MESSAGE', id } as any);
  }
}
