import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import type { BgMessage, BgResponse, PortMessage } from '../../../shared/types';

@Injectable({ providedIn: 'root' })
export class ChromeMessagingService {
  send<T>(message: BgMessage): Observable<BgResponse<T>> {
    return from(chrome.runtime.sendMessage<BgMessage, BgResponse<T>>(message));
  }

  stream<T>(portName: string, suffix?: 'refresh' | 'full'): Observable<PortMessage<T>> {
    return new Observable(observer => {
      const name = suffix ? `${portName}:${suffix}` : portName;
      const port = chrome.runtime.connect({ name });

      port.onMessage.addListener((msg: PortMessage<T>) => {
        observer.next(msg);
        if (msg.type === 'RESULT') {
          observer.complete();
        }
      });

      port.onDisconnect.addListener(() => observer.complete());

      return () => port.disconnect();
    });
  }
}
