import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChromeMessagingService } from '../../core/messaging/chrome-messaging.service';
import type { SenderStat, SizeStat, SubjectStat, StatsResult, PortMessage } from '../../../shared/types';

export type { SenderStat, SizeStat, SubjectStat, StatsResult, PortMessage };

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
}
