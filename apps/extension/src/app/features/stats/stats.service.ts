import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChromeMessagingService } from '../../core/messaging/chrome-messaging.service';
import type { SenderStat, SizeStat, SubjectStat, GlobalStats, QuickFilter, PortMessage, BgResponse, BgMessage, TrashResult } from '../../../shared/types';

export type { SenderStat, SizeStat, SubjectStat, GlobalStats, QuickFilter, PortMessage, BgResponse, BgMessage, TrashResult };

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly messaging = inject(ChromeMessagingService);

  streamGlobalStats(suffix?: 'refresh' | 'full'): Observable<PortMessage<GlobalStats>> {
    return this.messaging.stream<GlobalStats>('GET_GLOBAL_STATS', suffix);
  }

  trashMessages(ids: string[]): Observable<BgResponse<TrashResult>> {
    return this.messaging.send<TrashResult>({ type: 'TRASH_MESSAGES', ids } as BgMessage & { ids: string[] });
  }

  untrashMessages(ids: string[]): Observable<BgResponse<TrashResult>> {
    return this.messaging.send<TrashResult>({ type: 'UNTRASH_MESSAGES', ids } as BgMessage & { ids: string[] });
  }
}
