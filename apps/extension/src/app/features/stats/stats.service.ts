import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChromeMessagingService } from '../../core/messaging/chrome-messaging.service';
import type { SenderStat, SizeStat, SubjectStat, GlobalStats, QuickFilter, PortMessage, BgResponse, BgMessage } from '../../../shared/types';

export type { SenderStat, SizeStat, SubjectStat, GlobalStats, QuickFilter, PortMessage, BgResponse, BgMessage };

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly messaging = inject(ChromeMessagingService);

  streamGlobalStats(forceRefresh = false): Observable<PortMessage<GlobalStats>> {
    return this.messaging.stream<GlobalStats>('GET_GLOBAL_STATS', forceRefresh);
  }

  deleteByQuery(query: string): Observable<BgResponse<{ success: boolean; count: number }>> {
    return this.messaging.send<{ success: boolean; count: number }>({ type: 'DELETE_EMAILS_BY_QUERY', query } as BgMessage & { query: string });
  }

  deleteMessage(id: string): Observable<BgResponse<boolean>> {
    return this.messaging.send<boolean>({ type: 'DELETE_MESSAGE', id } as BgMessage & { id: string });
  }
}
